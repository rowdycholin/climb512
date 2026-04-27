"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { MessageCircle, Send } from "lucide-react";
import { continuePlanIntake, createPlanFromIntake } from "@/app/actions";
import {
  createInitialIntakeDraft,
  type IntakeMessage,
  type PartialIntakeDraft,
} from "@/lib/intake";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const DISCIPLINES = [
  { value: "bouldering", label: "Bouldering" },
  { value: "sport", label: "Sport" },
  { value: "trad", label: "Trad" },
  { value: "ice", label: "Ice Climbing" },
  { value: "alpine", label: "Alpine" },
];

const WEEK_OPTIONS = [4, 8, 12, 16, 24, 32, 52];
const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

function listToText(value: string[] | undefined) {
  return (value ?? []).join(", ");
}

function textToList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function hasRequiredDraftFields(draft: PartialIntakeDraft) {
  return Boolean(
    draft.sport &&
      draft.goalDescription &&
      draft.blockLengthWeeks &&
      draft.daysPerWeek &&
      draft.startDate &&
      draft.currentLevel,
  );
}

export default function PlanIntakeChat() {
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const entryRef = useRef<HTMLTextAreaElement | null>(null);
  const [draft, setDraft] = useState<PartialIntakeDraft>(() => createInitialIntakeDraft());
  const [messages, setMessages] = useState<IntakeMessage[]>([
    {
      role: "assistant",
      content: "For what sport or discipline would you like to create a training plan?",
    },
  ]);
  const [entry, setEntry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const ready = hasRequiredDraftFields(draft);
  const serializedDraft = useMemo(() => JSON.stringify(draft), [draft]);

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

  function updateDraft(changes: PartialIntakeDraft) {
    setDraft((current: PartialIntakeDraft) => ({ ...current, ...changes }));
  }

  function sendMessage() {
    const userMessage = entry.trim();
    if (!userMessage || isPending) return;

    const nextMessages: IntakeMessage[] = [...messages, { role: "user", content: userMessage }];
    setMessages(nextMessages);
    setEntry("");
    setError(null);

    startTransition(async () => {
      try {
        const response = await continuePlanIntake({
          draft,
          userMessage,
          messages: nextMessages,
        });
        setDraft(response.draft);
        setMessages([...nextMessages, { role: "assistant", content: response.assistantMessage }]);
        scrollToLatestAndFocus();
      } catch (caught) {
        setError((caught as Error).message || "The intake message could not be processed.");
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
      <section className="rounded-[1.4rem] border border-white/70 bg-white/90 p-4 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
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
          <div ref={messagesEndRef} aria-hidden="true" />
        </div>
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
            disabled={!entry.trim() || isPending}
            aria-label="Send intake message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>

      <Card className="border-slate-200 bg-white/95 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
        <CardHeader>
          <CardTitle>Plan Draft</CardTitle>
          <CardDescription>Review the structured intake before generating.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createPlanFromIntake} className="space-y-4">
            <input type="hidden" name="draft" value={serializedDraft} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="discipline">Primary Discipline</Label>
                <select
                  id="discipline"
                  value={draft.disciplines?.[0] ?? "bouldering"}
                  onChange={(event) => updateDraft({ disciplines: [event.target.value] })}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {DISCIPLINES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="startDate">Start Date</Label>
                <Input id="startDate" type="date" value={draft.startDate ?? ""} onChange={(event) => updateDraft({ startDate: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="currentGrade">Current Level</Label>
                <Input id="currentGrade" value={draft.currentLevel ?? ""} onChange={(event) => updateDraft({ currentLevel: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="targetGrade">Target Level</Label>
                <Input id="targetGrade" value={draft.targetLevel ?? ""} onChange={(event) => updateDraft({ targetLevel: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="weeksDuration">Weeks</Label>
                <select
                  id="weeksDuration"
                  value={draft.blockLengthWeeks ?? ""}
                  onChange={(event) => updateDraft({ blockLengthWeeks: parseInt(event.target.value, 10) })}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select...</option>
                  {WEEK_OPTIONS.map((weeks) => (
                    <option key={weeks} value={weeks}>
                      {weeks}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="daysPerWeek">Days Per Week</Label>
                <select
                  id="daysPerWeek"
                  value={draft.daysPerWeek ?? ""}
                  onChange={(event) => updateDraft({ daysPerWeek: parseInt(event.target.value, 10) })}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select...</option>
                  {DAY_OPTIONS.map((days) => (
                    <option key={days} value={days}>
                      {days}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goals">Goals</Label>
              <Textarea id="goals" value={draft.goalDescription ?? ""} onChange={(event) => updateDraft({ goalDescription: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="equipment">Equipment</Label>
              <Input id="equipment" value={listToText(draft.equipment)} onChange={(event) => updateDraft({ equipment: textToList(event.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trainingFocus">Training Focus</Label>
              <Input
                id="trainingFocus"
                value={listToText(draft.trainingFocus)}
                onChange={(event) => updateDraft({ trainingFocus: textToList(event.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="injuries">Injuries / Limitations</Label>
              <Input
                id="injuries"
                value={listToText(draft.constraints?.injuries)}
                onChange={(event) =>
                  updateDraft({
                    constraints: {
                      injuries: textToList(event.target.value),
                      limitations: draft.constraints?.limitations ?? [],
                      avoidExercises: draft.constraints?.avoidExercises ?? [],
                    },
                  })
                }
              />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={!ready}>
              Generate Training Plan
            </Button>
            {!ready && <p className="text-center text-xs text-slate-500">Complete the required draft fields to generate.</p>}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
