"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { MessageCircle, Send, WandSparkles } from "lucide-react";
import { continuePlanIntake, createPlanFromIntake } from "@/app/actions";
import {
  createInitialIntakeDraft,
  type IntakeMessage,
  type PartialIntakeDraft,
} from "@/lib/intake";
import { planRequestSchema } from "@/lib/plan-request";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SectionPanel } from "@/components/ui/app-shell";

function hasRequiredDraftFields(draft: PartialIntakeDraft) {
  return planRequestSchema.safeParse(draft).success && Boolean(draft.finalIntakeReviewAsked);
}

function PendingAssistantBubble({ longWait }: { longWait: boolean }) {
  return (
    <div className="mr-auto max-w-[88%] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
      <div className="flex items-center gap-2">
        <span className="flex gap-1" aria-hidden="true">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500 [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500 [animation-delay:300ms]" />
        </span>
        <span>{longWait ? "Still working. The AI backend is taking longer than usual." : "Checking your answer..."}</span>
      </div>
    </div>
  );
}

function draftFacts(draft: PartialIntakeDraft) {
  const currentLevel = draft.currentLevel && !isScheduleOnlyText(draft.currentLevel) ? draft.currentLevel : null;
  return [
    draft.sport ? `Sport: ${draft.sport}` : null,
    draft.goalDescription ? `Goal: ${draft.goalDescription}` : null,
    draft.blockLengthWeeks ? `Length: ${draft.blockLengthWeeks} weeks` : null,
    draft.daysPerWeek ? `Schedule: ${draft.daysPerWeek} days/week` : null,
    currentLevel ? `Current: ${currentLevel}` : null,
    draft.targetLevel ? `Target: ${draft.targetLevel}` : null,
    draft.startDate ? `Start: ${draft.startDate}` : null,
    draft.equipment?.length ? `Equipment: ${draft.equipment.join(", ")}` : null,
  ].filter((fact): fact is string => Boolean(fact));
}

function isScheduleOnlyText(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[.!?]+$/g, "");
  return /^(?:i\s+can\s+)?(?:train|run|ride|lift|climb)?\s*(?:[1-7]|one|two|three|four|five|six|seven)\s*(?:x|times?|days?|sessions?)(?:\s*(?:per|a|\/)\s*week| weekly)?$/.test(normalized);
}

function localIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface PlanIntakeChatProps {
  coachName: string;
}

export default function PlanIntakeChat({ coachName }: PlanIntakeChatProps) {
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const entryRef = useRef<HTMLTextAreaElement | null>(null);
  const [draft, setDraft] = useState<PartialIntakeDraft>(() => createInitialIntakeDraft());
  const [messages, setMessages] = useState<IntakeMessage[]>([
    {
      role: "assistant",
      content: `Hi, I'm ${coachName}, your personal training coach. I’ll use what you tell me to build a plan that fits your goals, schedule, experience, equipment, and recovery needs. For now I can build plans for climbing, running, cycling, and strength/conditioning training. Which one would you like to train for?`,
    },
  ]);
  const [entry, setEntry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const [longWait, setLongWait] = useState(false);
  const [retryRequest, setRetryRequest] = useState<{
    draft: PartialIntakeDraft;
    userMessage: string;
    messages: IntakeMessage[];
  } | null>(null);
  const [canGeneratePlan, setCanGeneratePlan] = useState(false);
  const [isPending, startTransition] = useTransition();

  const fieldsComplete = hasRequiredDraftFields(draft);
  const serializedDraft = useMemo(() => JSON.stringify(draft), [draft]);
  const knownFacts = useMemo(() => draftFacts(draft), [draft]);
  const sendDisabled = !entry.trim() || isWaiting || isPending;

  function focusEntry() {
    const field =
      entryRef.current ??
      (document.querySelector('[aria-label="Plan intake message"]') as HTMLTextAreaElement | null);
    field?.focus({ preventScroll: true });
  }

  function scrollToLatestAndFocus() {
    window.requestAnimationFrame(() => {
      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
      focusEntry();
      window.setTimeout(focusEntry, 50);
      window.setTimeout(focusEntry, 150);
      window.setTimeout(focusEntry, 300);
    });
  }

  useEffect(() => {
    scrollToLatestAndFocus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  useEffect(() => {
    entryRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isWaiting) {
      setLongWait(false);
      return;
    }

    const timer = window.setTimeout(() => setLongWait(true), 8000);
    return () => window.clearTimeout(timer);
  }, [isWaiting]);

  function requestNextAssistantMessage(request: {
    draft: PartialIntakeDraft;
    userMessage: string;
    messages: IntakeMessage[];
  }) {
    setError(null);
    setRetryRequest(null);
    setIsWaiting(true);
    setLongWait(false);

    startTransition(async () => {
      try {
        const response = await continuePlanIntake({
          draft: request.draft,
          userMessage: request.userMessage,
          messages: request.messages,
          coachName,
          clientToday: localIsoDate(),
          clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        if (response.assistantMessage === "SESSION_EXPIRED") {
          window.location.href = "/login";
          return;
        }
        setDraft(response.draft);
        setCanGeneratePlan(response.ready);
        setMessages([...request.messages, { role: "assistant", content: response.assistantMessage }]);
        scrollToLatestAndFocus();
      } catch (caught) {
        setError((caught as Error).message || "The intake message could not be processed.");
        setRetryRequest(request);
      } finally {
        setIsWaiting(false);
      }
    });
  }

  function sendMessage() {
    const userMessage = entry.trim();
    if (!userMessage || isWaiting || isPending) return;

    const nextMessages: IntakeMessage[] = [...messages, { role: "user", content: userMessage }];
    setMessages(nextMessages);
    setEntry("");
    setCanGeneratePlan(false);
    requestNextAssistantMessage({ draft, userMessage, messages: nextMessages });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <SectionPanel>
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <MessageCircle className="h-4 w-4 text-sky-700" />
          Guided Intake
        </div>
        <div ref={messagesContainerRef} className="max-h-[460px] space-y-3 overflow-y-auto pr-1">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={
                message.role === "user"
                  ? "ml-auto max-w-[85%] rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white"
                  : "mr-auto max-w-[88%] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
              }
            >
              {message.content}
            </div>
          ))}
          {isWaiting && <PendingAssistantBubble longWait={longWait} />}
          <div ref={messagesEndRef} aria-hidden="true" />
        </div>
        {knownFacts.length > 0 && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Known so far</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {knownFacts.map((fact) => (
                <span key={fact} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
                  {fact}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <Textarea
            ref={entryRef}
            aria-label="Plan intake message"
            value={entry}
            onChange={(event) => setEntry(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Answer the current question..."
            className="min-h-20 resize-none"
          />
          <Button
            type="button"
            size="icon-lg"
            onMouseDown={(event) => event.preventDefault()}
            onClick={sendMessage}
            disabled={sendDisabled}
            aria-label="Send intake message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <p>{error}</p>
            {retryRequest && (
              <button
                type="button"
                onClick={() => requestNextAssistantMessage(retryRequest)}
                className="mt-2 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
              >
                Try again
              </button>
            )}
          </div>
        )}
        <form action={createPlanFromIntake} className="mt-4 flex items-center justify-end gap-3">
          <input type="hidden" name="draft" value={serializedDraft} />
          <p className="text-right text-xs text-slate-500">
            {canGeneratePlan
              ? "Ready. Click the magic wand to generate your plan."
              : fieldsComplete
                ? "Almost ready. Finish the last chat checkpoint to unlock plan creation."
                : "Answer the remaining questions to unlock plan creation."}
          </p>
          <Button
            type="submit"
            size="icon-lg"
            disabled={!canGeneratePlan}
            aria-label={canGeneratePlan ? "Generate training plan" : "Generate training plan locked"}
            title={canGeneratePlan ? "Generate training plan" : "Finish the chat first"}
          >
            <WandSparkles className="h-4 w-4" />
          </Button>
        </form>
      </SectionPanel>
    </div>
  );
}
