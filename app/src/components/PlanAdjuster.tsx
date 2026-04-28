"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { adjustFuturePlan } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Week {
  weekNum: number;
}

interface PlanAdjusterProps {
  planId: string;
  week: Week;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const STARTER_PROMPTS: Record<string, string[]> = {
  too_hard: [
    "Make the rest of this plan easier. I am not recovering well.",
    "Reduce intensity and volume from the next unlogged day forward.",
  ],
  too_easy: [
    "Make the rest of this plan a little harder without increasing injury risk.",
    "Add a bit more challenge to future training days.",
  ],
  missed_time: [
    "I missed several sessions and need the future plan reset gently.",
    "Help me resume after missed time without cramming workouts.",
  ],
  injury: [
    "I have a small tweak and need future sessions modified conservatively.",
    "Reduce risky work and make the rest of the plan more recovery-friendly.",
  ],
  travel: [
    "I will be traveling and need simpler future sessions.",
    "Adjust future training for limited equipment and inconsistent schedule.",
  ],
  new_goal: [
    "My goal changed. Adjust future days toward the new priority.",
    "Shift the rest of the plan toward my new objective.",
  ],
  schedule_change: [
    "My schedule changed and future training needs to be more manageable.",
    "Make the remaining plan fit a less predictable week.",
  ],
  other: [
    "Adjust the remaining plan based on this feedback.",
    "Update future days while preserving everything I already logged.",
  ],
};

const reasonLabels = [
  ["too_hard", "Too hard"],
  ["too_easy", "Too easy"],
  ["missed_time", "Missed time"],
  ["injury", "Injury or limitation"],
  ["travel", "Travel"],
  ["new_goal", "New goal"],
  ["schedule_change", "Schedule change"],
  ["other", "Other"],
] as const;

export default function PlanAdjuster({ planId, week, isOpen, onOpenChange }: PlanAdjusterProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [reason, setReason] = useState<(typeof reasonLabels)[number][0]>("too_hard");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ summary: string; effectiveFrom: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const open = isOpen ?? internalOpen;

  function setOpen(nextValue: boolean | ((value: boolean) => boolean)) {
    const next = typeof nextValue === "function" ? nextValue(open) : nextValue;
    if (onOpenChange) {
      onOpenChange(next);
      return;
    }

    setInternalOpen(next);
  }

  function loadPrompt(prompt: string) {
    setFeedback(prompt);
    setError(null);
    setResult(null);
  }

  function handleSubmit() {
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.set("planId", planId);
    formData.set("reason", reason);
    formData.set("feedback", feedback);

    startTransition(async () => {
      const response = await adjustFuturePlan(formData);
      if (response.error || !response.summary || !response.effectiveFrom) {
        setError(response.error ?? "The plan could not be adjusted");
        return;
      }

      setResult({
        summary: response.summary,
        effectiveFrom: response.effectiveFrom,
      });
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
              Describe what changed. Logged days stay protected, and updates start from the next unlogged day.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="adjust-reason">Reason</Label>
          <select
            id="adjust-reason"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value as typeof reason);
              setError(null);
              setResult(null);
            }}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {reasonLabels.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="adjust-feedback">What should change?</Label>
          <Textarea
            id="adjust-feedback"
            value={feedback}
            onChange={(event) => {
              setFeedback(event.target.value);
              setResult(null);
            }}
            placeholder="Example: Make the remaining plan easier because my fingers feel tired."
            className="min-h-24"
          />
          <div className="flex flex-wrap gap-2">
            {STARTER_PROMPTS[reason].map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => loadPrompt(prompt)}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={handleSubmit} disabled={pending}>
            {pending ? "Adjusting..." : "Adjust future plan"}
          </Button>
          <p className="text-xs text-slate-500">Current view: Week {week.weekNum}</p>
        </div>

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
