"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, MessageCircle, Send, WandSparkles, X } from "lucide-react";
import { applyConfirmedPlanAdjustment } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Week {
  weekNum: number;
  days: Array<{
    dayNum: number;
    dayName: string;
    focus: string;
    isRest: boolean;
    sessions: unknown[];
  }>;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface Proposal {
  summary: string;
  changes: string[];
  feedback: string;
  reason: string;
  scope: AdjustmentScope;
  scopeLabel: string;
  requiresGoalChangeConfirmation: boolean;
  previewGroups: string[];
  previewDetails: Array<{
    weekNum: number;
    dayNum: number;
    dayName: string;
    focus: string;
    summary: string;
  }>;
}

type AdjustmentScope =
  | { type: "day_only"; startWeek: number; startDay: number; endWeek: number; endDay: number }
  | { type: "week_only"; startWeek: number; endWeek: number }
  | { type: "date_range"; startWeek: number; startDay: number; endWeek: number; endDay: number }
  | { type: "future_from_day"; startWeek: number; startDay: number };

interface AdjustmentMetadata {
  affectedDays: Array<{
    weekNum: number;
    dayNum: number;
    planDay: number;
    dayName: string;
    summary: string;
  }>;
}

interface PlanAdjusterProps {
  planId: string;
  week: Week;
  weeks: Week[];
  sport: string;
  disciplines: string[];
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onAdjustmentApplied?: (metadata: AdjustmentMetadata) => void;
}

const GENERIC_STARTER_PROMPTS = [
  "I am not recovering well. Make the rest of the plan more manageable.",
  "My schedule changed. Adjust future training days around my new availability.",
  "I am traveling next week with limited equipment. Make those sessions simpler.",
  "I feel good after today's work. Add a little extra work to a future day.",
];

function starterPromptsForSport(sport: string, disciplines: string[]) {
  const label = `${sport} ${disciplines.join(" ")}`.toLowerCase();

  if (/\brun|marathon|5k|10k|trail/.test(label)) {
    return [
      "My legs feel heavy. Reduce run intensity for the rest of the plan.",
      "I missed a run and need the next week adjusted without cramming mileage.",
      "I can only run three days per week now. Adjust the future schedule.",
      "I feel strong after today's run. Add a small, safe progression later this week.",
    ];
  }

  if (/\bstrength|lifting|weights|powerlifting|bodybuilding/.test(label)) {
    return [
      "My joints feel beat up. Reduce lifting intensity for the rest of the plan.",
      "I missed a strength session and need the next week adjusted without doubling up.",
      "I only have dumbbells available next week. Adjust future sessions.",
      "I feel strong after today's workout. Add a small accessory progression later this week.",
    ];
  }

  if (/\bclimb|boulder|trad|alpine|ice/.test(label)) {
    return [
      "My fingers feel tired. Reduce finger load for the rest of the plan.",
      "I can only train three days per week now. Adjust the future schedule.",
      "I am traveling next week with limited climbing equipment. Make those sessions simpler.",
      "I feel good after today's work. Add a little extra climbing support to a future day.",
    ];
  }

  return GENERIC_STARTER_PROMPTS;
}

const VAGUE_REQUESTS = new Set([
  "adjust",
  "change",
  "change it",
  "fix it",
  "make it better",
  "help",
  "update",
]);

function messageId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function inferReason(text: string) {
  const normalized = text.toLowerCase();
  if (/\binjur|\bpain|\btweak|\bsore|\bhurt/.test(normalized)) return "injury";
  if (/\btravel|\btrip|\bhotel|\baway/.test(normalized)) return "travel";
  if (/\bmiss|\bmissed|\bsick|\bresume|\bcatch up/.test(normalized)) return "missed_time";
  if (/\bschedule|\bdays per week|\bavailable|\bavailability|\bbusy/.test(normalized)) return "schedule_change";
  if (/\bgoal|\btarget|\brace|\bevent|\bcompetition/.test(normalized)) return "new_goal";
  if (/\beasier|\breduce|\bless|\btired|\bfatigue|\brecover/.test(normalized)) return "too_hard";
  if (/\bharder|\bmore|\bextra|\badd|\bprogress/.test(normalized)) return "too_easy";
  return "other";
}

function isVague(text: string) {
  const normalized = text.trim().toLowerCase();
  return normalized.length < 18 || VAGUE_REQUESTS.has(normalized);
}

function mentionsGoalChange(text: string) {
  return /\b(new|different|change|switch|replace)\s+(goal|target|event|race|objective)\b/i.test(text);
}

function detectSchedulePattern(text: string) {
  const normalized = text.toLowerCase();
  const dayNames = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const mentionedDays = dayNames.filter((day) => normalized.includes(day) || normalized.includes(day.slice(0, 3)));
  if (mentionedDays.length < 2 || !/\bmove|swap|switch|shift\b/.test(normalized)) return null;
  return mentionedDays;
}

function mentionedDayNum(text: string) {
  const normalized = text.toLowerCase();
  const dayNames = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const index = dayNames.findIndex((day) => normalized.includes(day) || normalized.includes(day.slice(0, 3)));
  return index >= 0 ? index + 1 : null;
}

function inferScope(text: string, activeWeekNum: number): AdjustmentScope {
  const normalized = text.toLowerCase();
  const dayNum = mentionedDayNum(normalized);
  const targetWeek = /\bnext week\b/.test(normalized) ? activeWeekNum + 1 : activeWeekNum;

  if (/\b(rest of|remaining|from now|from today|going forward|onward|future)\b/.test(normalized)) {
    return { type: "future_from_day", startWeek: activeWeekNum, startDay: 1 };
  }

  if (/\b(today only|this day only|day only|only today)\b/.test(normalized)) {
    return { type: "day_only", startWeek: activeWeekNum, startDay: 1, endWeek: activeWeekNum, endDay: 1 };
  }

  if (dayNum && /\bonly|just|single day|one day\b/.test(normalized)) {
    return { type: "day_only", startWeek: targetWeek, startDay: dayNum, endWeek: targetWeek, endDay: dayNum };
  }

  if (/\b(this week|next week|week only|only this week|only next week|traveling next week|travelling next week)\b/.test(normalized)) {
    return { type: "week_only", startWeek: targetWeek, endWeek: targetWeek };
  }

  return { type: "future_from_day", startWeek: activeWeekNum, startDay: 1 };
}

function hasScopeCue(text: string) {
  return /\b(rest of|remaining|from now|from today|going forward|onward|future|today only|this day only|day only|only today|only|just|single day|one day|this week|next week|week only|traveling next week|travelling next week)\b/i.test(text);
}

function asksForScope(message: ChatMessage) {
  return message.role === "assistant" && message.content.includes("Should this apply");
}

function scopeIncludesDay(scope: AdjustmentScope, weekNum: number, dayNum: number) {
  const planDay = planDayFromWeekDay(weekNum, dayNum);
  switch (scope.type) {
    case "day_only":
    case "date_range":
      return planDay >= planDayFromWeekDay(scope.startWeek, scope.startDay) &&
        planDay <= planDayFromWeekDay(scope.endWeek, scope.endDay);
    case "week_only":
      return weekNum >= scope.startWeek && weekNum <= scope.endWeek;
    case "future_from_day":
      return planDay >= planDayFromWeekDay(scope.startWeek, scope.startDay);
  }
}

function scopeLabel(scope: AdjustmentScope) {
  switch (scope.type) {
    case "day_only":
      return `Week ${scope.startWeek}, Day ${scope.startDay} only`;
    case "week_only":
      return scope.startWeek === scope.endWeek ? `Week ${scope.startWeek} only` : `Weeks ${scope.startWeek}-${scope.endWeek} only`;
    case "date_range":
      return `Week ${scope.startWeek}, Day ${scope.startDay} through Week ${scope.endWeek}, Day ${scope.endDay}`;
    case "future_from_day":
      return `From Week ${scope.startWeek}, Day ${scope.startDay} through plan end`;
  }
}

function scopeOptions(activeWeekNum: number) {
  return [
    {
      label: `Week ${activeWeekNum} only`,
      scope: { type: "week_only", startWeek: activeWeekNum, endWeek: activeWeekNum } satisfies AdjustmentScope,
    },
    {
      label: "Rest of plan",
      scope: { type: "future_from_day", startWeek: activeWeekNum, startDay: 1 } satisfies AdjustmentScope,
    },
  ];
}

function summarizeWeekRanges(weekNums: number[]) {
  const unique = Array.from(new Set(weekNums)).sort((a, b) => a - b);
  if (unique.length === 0) return "No weeks";

  const ranges: string[] = [];
  let start = unique[0];
  let prev = unique[0];

  for (const weekNum of unique.slice(1)) {
    if (weekNum === prev + 1) {
      prev = weekNum;
      continue;
    }

    ranges.push(start === prev ? `Week ${start}` : `Weeks ${start}-${prev}`);
    start = weekNum;
    prev = weekNum;
  }

  ranges.push(start === prev ? `Week ${start}` : `Weeks ${start}-${prev}`);
  return ranges.join(", ");
}

function buildPreviewGroups(params: {
  feedback: string;
  reason: string;
  weeks: Week[];
  activeWeekNum: number;
  scope: AdjustmentScope;
}) {
  const remainingWeeks = params.weeks.filter((item) => item.days.some((day) => scopeIncludesDay(params.scope, item.weekNum, day.dayNum)));
  const schedulePattern = detectSchedulePattern(params.feedback);

  if (schedulePattern) {
    const affectedDetails = remainingWeeks.flatMap((item) =>
      item.days
        .filter((day) => scopeIncludesDay(params.scope, item.weekNum, day.dayNum) && schedulePattern.includes(day.dayName.toLowerCase()))
        .map((day) => ({
          weekNum: item.weekNum,
          dayNum: day.dayNum,
          dayName: day.dayName,
          focus: day.focus,
          summary: `${day.dayName}: ${day.focus}`,
        })),
    );

    return {
      groups: [
        `${summarizeWeekRanges(affectedDetails.map((day) => day.weekNum))}: review ${schedulePattern.map((day) => day[0].toUpperCase() + day.slice(1)).join(" and ")} placement.`,
        "Logged days stay protected; exact changed days are highlighted after apply.",
      ],
      details: affectedDetails,
    };
  }

  const trainingDetails = remainingWeeks.flatMap((item) =>
      item.days
      .filter((day) => scopeIncludesDay(params.scope, item.weekNum, day.dayNum) && !day.isRest && day.sessions.length > 0)
      .map((day) => ({
        weekNum: item.weekNum,
        dayNum: day.dayNum,
        dayName: day.dayName,
        focus: day.focus,
        summary: params.reason === "too_easy" ? "Increase training stimulus modestly" : "Adjust training load conservatively",
      })),
  );

  return {
    groups: [
      `${summarizeWeekRanges(trainingDetails.map((day) => day.weekNum))}: update future training days from the next unlogged day.`,
      "Rest days and logged workout history remain protected unless the change request specifically targets schedule placement.",
    ],
    details: trainingDetails,
  };
}

function buildProposal(messages: ChatMessage[], latestMessage: string, weeks: Week[], activeWeekNum: number): Proposal {
  const userFeedback = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .concat(latestMessage)
    .join("\n");
  const reason = inferReason(userFeedback);
  const scope = inferScope(userFeedback, activeWeekNum);
  const requiresGoalChangeConfirmation = mentionsGoalChange(userFeedback);
  const preview = buildPreviewGroups({
    feedback: userFeedback,
    reason,
    weeks,
    activeWeekNum,
    scope,
  });

  const changes = [
    "Keep logged days and completed exercises unchanged.",
    `Scope: ${scopeLabel(scope)}.`,
    requiresGoalChangeConfirmation
      ? "Flag this as a goal-changing adjustment before it is applied."
      : "Preserve the original sport, goal, target, and block length.",
  ];

  return {
    summary: requiresGoalChangeConfirmation
      ? "I can prepare a goal-changing adjustment for confirmation."
      : "I can adjust the remaining plan around your request.",
    changes,
    feedback: userFeedback,
    reason,
    scope,
    scopeLabel: scopeLabel(scope),
    requiresGoalChangeConfirmation,
    previewGroups: preview.groups,
    previewDetails: preview.details,
  };
}

function proposalWithScope(proposal: Proposal, scope: AdjustmentScope, weeks: Week[], activeWeekNum: number): Proposal {
  const preview = buildPreviewGroups({
    feedback: proposal.feedback,
    reason: proposal.reason,
    weeks,
    activeWeekNum,
    scope,
  });

  return {
    ...proposal,
    scope,
    scopeLabel: scopeLabel(scope),
    changes: [
      "Keep logged days and completed exercises unchanged.",
      `Scope: ${scopeLabel(scope)}.`,
      proposal.requiresGoalChangeConfirmation
        ? "Flag this as a goal-changing adjustment before it is applied."
        : "Preserve the original sport, goal, target, and block length.",
    ],
    previewGroups: preview.groups,
    previewDetails: preview.details,
  };
}

function planDayFromWeekDay(weekNum: number, dayNum: number) {
  return (weekNum - 1) * 7 + dayNum;
}

export default function PlanAdjuster({
  planId,
  week,
  weeks,
  sport,
  disciplines,
  isOpen,
  onOpenChange,
  onAdjustmentApplied,
}: PlanAdjusterProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "intro",
      role: "assistant",
      content: "Tell me what you would like to change, and I will show a proposed new plan that you can approve.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ summary: string; effectiveFrom: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const open = isOpen ?? internalOpen;
  const canSend = draft.trim().length > 0 && !pending;
  const visibleMessages = useMemo(() => messages.slice(-8), [messages]);
  const starterPrompts = useMemo(() => starterPromptsForSport(sport, disciplines), [sport, disciplines]);

  function setOpen(nextValue: boolean | ((value: boolean) => boolean)) {
    const next = typeof nextValue === "function" ? nextValue(open) : nextValue;
    if (onOpenChange) {
      onOpenChange(next);
      return;
    }

    setInternalOpen(next);
  }

  function resetSession() {
    setMessages([
      {
        id: "intro",
        role: "assistant",
        content: "Tell me what you would like to change, and I will show a proposed new plan that you can approve.",
      },
    ]);
    setDraft("");
    setProposal(null);
    setDetailsOpen(false);
    setError(null);
    setResult(null);
  }

  function addAssistant(content: string, nextMessages: ChatMessage[]) {
    setMessages([
      ...nextMessages,
      {
        id: messageId(),
        role: "assistant",
        content,
      },
    ]);
  }

  function handleSend() {
    const content = draft.trim();
    if (!content) return;

    const nextMessages = [
      ...messages,
      {
        id: messageId(),
        role: "user" as const,
        content,
      },
    ];

    setDraft("");
    setError(null);
    setResult(null);
    setProposal(null);
    setDetailsOpen(false);

    const isScopeAnswer = messages.some(asksForScope);
    if (!isScopeAnswer && isVague(content)) {
      addAssistant(
        "What specifically should change: intensity, schedule, exercises, equipment, recovery, or the goal?",
        nextMessages,
      );
      return;
    }

    if (!isScopeAnswer && !hasScopeCue(content)) {
      addAssistant(
        "Should this apply only to this week, only to one day, or to the rest of the plan?",
        nextMessages,
      );
      return;
    }

    const nextProposal = buildProposal(messages, content, weeks, week.weekNum);
    setMessages([
      ...nextMessages,
      {
        id: messageId(),
        role: "assistant",
        content: "I have enough to propose a scoped adjustment. Review the affected areas below before applying it.",
      },
    ]);
    setProposal(nextProposal);
  }

  function loadPrompt(prompt: string) {
    setDraft(prompt);
    setError(null);
    setResult(null);
    setProposal(null);
    setDetailsOpen(false);
  }

  function applyProposal() {
    if (!proposal) return;

    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.set("planId", planId);
    formData.set("reason", proposal.reason);
    formData.set("feedback", proposal.feedback);
    formData.set("adjustmentScope", JSON.stringify(proposal.scope));
    formData.set("proposalSummary", proposal.summary);
    formData.set("proposalChanges", JSON.stringify([...proposal.changes, ...proposal.previewGroups]));
    formData.set("requiresGoalChangeConfirmation", proposal.requiresGoalChangeConfirmation ? "true" : "false");
    formData.set("goalChangeConfirmed", proposal.requiresGoalChangeConfirmation ? "true" : "false");

    startTransition(async () => {
      const response = await applyConfirmedPlanAdjustment(formData);
      if (response.error || !response.summary || !response.effectiveFrom) {
        setError(response.error ?? "The plan could not be adjusted");
        return;
      }

      setResult({
        summary: response.summary,
        effectiveFrom: response.effectiveFrom,
      });
      onAdjustmentApplied?.({
        affectedDays: proposal.previewDetails.map((detail) => ({
          weekNum: detail.weekNum,
          dayNum: detail.dayNum,
          planDay: planDayFromWeekDay(detail.weekNum, detail.dayNum),
          dayName: detail.dayName,
          summary: detail.summary,
        })),
      });
      setProposal(null);
      setDetailsOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return null;
  }

  return (
    <Card className="mb-6 border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle role="heading" aria-level={3} className="flex items-center gap-2 text-slate-800">
              <MessageCircle className="h-4 w-4" />
              Adjust Future Plan
            </CardTitle>
            <CardDescription>
              Chat through a change, review the proposal, then apply it to future unlogged days.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {visibleMessages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <p
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    message.role === "user"
                      ? "bg-slate-900 text-white"
                      : "border border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  {message.content}
                </p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjust-chat-message">Adjustment request</Label>
            <div className="flex gap-2">
              <Textarea
                id="adjust-chat-message"
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setError(null);
                  setResult(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Example: My schedule changed. Move future Thursday rest days to Saturday."
                className="min-h-20 resize-none bg-white"
              />
              <Button
                type="button"
                size="icon-lg"
                onMouseDown={(event) => event.preventDefault()}
                onClick={handleSend}
                disabled={!canSend}
                aria-label="Send adjustment message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => loadPrompt(prompt)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={resetSession} disabled={pending}>
              Start over
            </Button>
            <p className="text-xs text-slate-500">Current view: Week {week.weekNum}</p>
          </div>
        </div>

        {proposal && (
          <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4 text-sm text-sky-900">
            <div className="flex items-start gap-2">
              <WandSparkles className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Review adjustment proposal</p>
                <p className="mt-1">{proposal.summary}</p>
                <p className="mt-2 rounded-lg border border-sky-200 bg-white/70 px-3 py-2 text-xs font-semibold text-sky-800">
                  Scope: {proposal.scopeLabel}
                </p>
              </div>
            </div>
            <ul className="mt-3 space-y-1">
              {[...proposal.changes, ...proposal.previewGroups].map((change) => (
                <li key={change} className="flex gap-2">
                  <span aria-hidden="true">-</span>
                  <span>{change}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 rounded-lg border border-sky-200 bg-white/70 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">Scope override</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {scopeOptions(week.weekNum).map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => setProposal((current) => current ? proposalWithScope(current, option.scope, weeks, week.weekNum) : current)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      scopeLabel(proposal.scope) === option.label
                        ? "border-sky-300 bg-sky-100 text-sky-800"
                        : "border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:text-sky-700"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            {proposal.previewDetails.length > 0 && (
              <div className="mt-3 rounded-lg border border-sky-200 bg-white/70">
                <button
                  type="button"
                  onClick={() => setDetailsOpen((value) => !value)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-medium text-sky-900"
                >
                  <span>Review affected days ({proposal.previewDetails.length})</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
                </button>
                {detailsOpen && (
                  <div className="max-h-48 space-y-1 overflow-y-auto border-t border-sky-100 px-3 py-2">
                    {proposal.previewDetails.map((detail, index) => (
                      <p key={`${detail.weekNum}-${detail.dayName}-${index}`} className="text-xs text-slate-700">
                        Week {detail.weekNum}, {detail.dayName}: {detail.summary}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
            {proposal.requiresGoalChangeConfirmation && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                This looks like a goal change. Applying it will still protect logged history, but review it carefully before continuing.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" onClick={applyProposal} disabled={pending} className="gap-2">
                <Check className="h-4 w-4" />
                {pending ? "Applying..." : "Apply proposal"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setProposal(null)} disabled={pending}>
                Revise
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending} className="gap-2">
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-800">
            <p className="font-semibold">{result.summary}</p>
            <p className="mt-1">Changes begin at {result.effectiveFrom}. Previous logs remain attached to the older version.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
