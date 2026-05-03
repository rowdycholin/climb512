"use client";

import PlanEditor from "@/components/PlanEditor";
import PlanAdjuster from "@/components/PlanAdjuster";
import PlanViewer from "@/components/PlanViewer";
import type { PlanUiState } from "@/lib/plan-ui-state";

export default function PlanWorkspace({
  planId,
  initialUiState,
  weeks,
  planGuidance,
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

  return (
    <>
      {activeWeek && !readOnly && (
        <>
          <PlanEditor
            planId={planId}
            week={activeWeek}
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
        totalWeeks={totalWeeks}
        generation={generation}
        adjustmentMetadata={adjustmentMetadata}
        initialWeekIndex={activeWeekIndex}
        initialDayIndex={initialDayIndex}
        activeWeekIndex={activeWeekIndex}
        onActiveWeekChange={onActiveWeekChange}
        readOnly={readOnly}
      />
    </>
  );
}
