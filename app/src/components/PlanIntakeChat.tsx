"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { MessageCircle, Send, WandSparkles } from "lucide-react";
import { continuePlanIntake, createPlanFromIntake } from "@/app/actions";
import {
  createInitialIntakeDraft,
  type IntakeMessage,
  type PartialIntakeDraft,
} from "@/lib/intake";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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
    <div className="mx-auto max-w-3xl">
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
        <form action={createPlanFromIntake} className="mt-4 flex items-center justify-end gap-3">
          <input type="hidden" name="draft" value={serializedDraft} />
          {!ready && <p className="text-right text-xs text-slate-500">Answer the remaining questions to unlock plan creation.</p>}
          <Button type="submit" size="icon-lg" disabled={!ready} aria-label="Generate Training Plan" title="Generate training plan">
            <WandSparkles className="h-4 w-4" />
          </Button>
        </form>
      </section>
    </div>
  );
}
