"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { suggestPlanAdjustment, applyPlanAdjustment } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ExerciseLog {
  completed: boolean;
}

interface Exercise {
  logs: ExerciseLog[];
}

interface DaySession {
  exercises: Exercise[];
}

interface Day {
  sessions: DaySession[];
}

interface Week {
  id: string;
  weekNum: number;
  theme: string;
  days: Day[];
}

interface PlanAdjusterProps {
  planId: string;
  week: Week;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const STARTER_PROMPTS = {
  reorder: [
    "Move the hardest session to Saturday and keep recovery balanced.",
    "Shift intense sessions away from back-to-back weekdays.",
  ],
  difficulty: [
    "Make this week easier because I'm feeling run down.",
    "Make this week a little harder without increasing injury risk.",
  ],
};

export default function PlanAdjuster({ planId, week, isOpen, onOpenChange }: PlanAdjusterProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [mode, setMode] = useState<"reorder" | "difficulty">("reorder");
  const [request, setRequest] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<{
    mode: "reorder" | "difficulty";
    summary: string;
    changes: string[];
    proposal: string;
  } | null>(null);
  const [isSuggesting, startSuggesting] = useTransition();
  const [isApplying, startApplying] = useTransition();
  const router = useRouter();

  const hasLogs = useMemo(
    () =>
      week.days.some((day) =>
        day.sessions.some((session) =>
          session.exercises.some((exercise) => exercise.logs.length > 0),
        ),
      ),
    [week.days],
  );

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
    setRequest(prompt);
    setError(null);
  }

  function handleSuggest() {
    setError(null);
    setProposal(null);

    const formData = new FormData();
    formData.set("planId", planId);
    formData.set("weekId", week.id);
    formData.set("mode", mode);
    formData.set("request", request);

    startSuggesting(async () => {
      const result = await suggestPlanAdjustment(formData);
      if (result.error || !result.proposal || !result.summary || !result.changes || !result.mode) {
        setError(result.error ?? "No adjustment proposal was returned");
        return;
      }

      setProposal({
        mode: result.mode,
        summary: result.summary,
        changes: result.changes,
        proposal: result.proposal,
      });
    });
  }

  function handleApply() {
    if (!proposal) return;
    setError(null);

    const formData = new FormData();
    formData.set("planId", planId);
    formData.set("weekId", week.id);
    formData.set("proposal", proposal.proposal);
    formData.set("mode", proposal.mode);

    startApplying(async () => {
      const result = await applyPlanAdjustment(formData);
      if (result.error) {
        setError(result.error);
        return;
      }

      setProposal(null);
      setRequest("");
      setOpen(false);
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
            <CardTitle className="flex items-center gap-2 text-slate-800">
              <Sparkles className="h-4 w-4" />
              Ask The Coach
            </CardTitle>
            <CardDescription>
              Use AI when you want guidance or a suggested rewrite for Week {week.weekNum}.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSuggesting || isApplying}>
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasLogs ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This week already has workout logs, so adjustments are locked to avoid mismatching your progress history.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="adjust-mode">Adjustment type</Label>
              <select
                id="adjust-mode"
                value={mode}
                onChange={(event) => {
                  setMode(event.target.value as "reorder" | "difficulty");
                  setProposal(null);
                  setError(null);
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="reorder">Reorder workouts</option>
                <option value="difficulty">Reduce or increase difficulty</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="adjust-request">What would you like to change?</Label>
              <Textarea
                id="adjust-request"
                value={request}
                onChange={(event) => setRequest(event.target.value)}
                placeholder={
                  mode === "reorder"
                    ? "Example: Move the hardest session to Saturday and spread recovery days out."
                    : "Example: Make this week easier because my fingers feel tired."
                }
                className="min-h-24"
              />
              <div className="flex flex-wrap gap-2">
                {STARTER_PROMPTS[mode].map((prompt) => (
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

            <div className="flex items-center gap-3">
              <Button type="button" onClick={handleSuggest} disabled={isSuggesting || isApplying}>
                {isSuggesting ? "Drafting..." : "Draft adjustment"}
              </Button>
              <p className="text-xs text-slate-500">Nothing changes until you confirm.</p>
            </div>
          </>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {proposal && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4">
            <p className="text-sm font-semibold text-slate-800">AI proposal</p>
            <p className="mt-1 text-sm text-slate-600">{proposal.summary}</p>
            <ul className="mt-3 space-y-1 text-sm text-slate-700">
              {proposal.changes.map((change) => (
                <li key={change}>- {change}</li>
              ))}
            </ul>
            <div className="mt-4 flex items-center gap-2">
              <Button type="button" onClick={handleApply} disabled={isApplying || isSuggesting}>
                {isApplying ? "Applying..." : "Apply this adjustment"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setProposal(null)}
                disabled={isApplying}
              >
                Keep current week
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
