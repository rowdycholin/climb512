"use client";

import { useEffect, useState } from "react";
import PlanEditor from "@/components/PlanEditor";
import PlanAdjuster from "@/components/PlanAdjuster";
import PlanViewer from "@/components/PlanViewer";
import type { PlanUiState } from "@/lib/plan-ui-state";

export default function PlanWorkspace({
  planId,
  initialUiState,
  weeks,
  planGuidance,
  coachOverview,
  athleteContextSummary,
  progressionStrategy,
  recoveryStrategy,
  totalWeeks,
  generation,
  sport,
  disciplines,
  adjustmentMetadata,
  onAdjustmentApplied,
  activeWeekIndex,
  initialDayIndex,
  editorOpen,
  onEditorOpenChange,
  coachOpen,
  onCoachOpenChange,
  onActiveWeekChange,
  readOnly = false,
}: {
  planId: string;
  initialUiState: PlanUiState;
  weeks: Parameters<typeof PlanViewer>[0]["weeks"];
  planGuidance: Parameters<typeof PlanViewer>[0]["planGuidance"];
  coachOverview?: Parameters<typeof PlanViewer>[0]["coachOverview"];
  athleteContextSummary?: Parameters<typeof PlanViewer>[0]["athleteContextSummary"];
  progressionStrategy?: Parameters<typeof PlanViewer>[0]["progressionStrategy"];
  recoveryStrategy?: Parameters<typeof PlanViewer>[0]["recoveryStrategy"];
  totalWeeks: number;
  generation: Parameters<typeof PlanViewer>[0]["generation"];
  sport: string;
  disciplines: string[];
  adjustmentMetadata: Parameters<typeof PlanViewer>[0]["adjustmentMetadata"];
  onAdjustmentApplied?: (metadata: NonNullable<Parameters<typeof PlanViewer>[0]["adjustmentMetadata"]>) => void;
  activeWeekIndex: number;
  initialDayIndex: number;
  editorOpen: boolean;
  onEditorOpenChange: (open: boolean) => void;
  coachOpen: boolean;
  onCoachOpenChange: (open: boolean) => void;
  onActiveWeekChange: (index: number) => void;
  readOnly?: boolean;
}) {
  const activeWeek = weeks[activeWeekIndex] ?? null;
  const initialDayId = activeWeek?.days[initialDayIndex]?.id ?? activeWeek?.days[0]?.id ?? null;
  const [activeDayId, setActiveDayId] = useState<string | null>(initialDayId);

  useEffect(() => {
    setActiveDayId(initialDayId);
  }, [initialDayId, activeWeek?.id]);

  return (
    <>
      {activeWeek && !readOnly && (
        <>
          <PlanEditor
            planId={planId}
            week={activeWeek}
            dayId={activeDayId}
            isOpen={editorOpen}
            onOpenChange={onEditorOpenChange}
          />
          <PlanAdjuster
            planId={planId}
            week={activeWeek}
            weeks={weeks}
            sport={sport}
            disciplines={disciplines}
            isOpen={coachOpen}
            onOpenChange={onCoachOpenChange}
            onAdjustmentApplied={onAdjustmentApplied}
          />
        </>
      )}
      <PlanViewer
        planId={planId}
        initialUiState={initialUiState}
        weeks={weeks}
        planGuidance={planGuidance}
        coachOverview={coachOverview}
        athleteContextSummary={athleteContextSummary}
        progressionStrategy={progressionStrategy}
        recoveryStrategy={recoveryStrategy}
        totalWeeks={totalWeeks}
        generation={generation}
        adjustmentMetadata={adjustmentMetadata}
        initialWeekIndex={activeWeekIndex}
        initialDayIndex={initialDayIndex}
        activeWeekIndex={activeWeekIndex}
        onActiveWeekChange={onActiveWeekChange}
        onActiveDayChange={setActiveDayId}
        readOnly={readOnly}
      />
    </>
  );
}
