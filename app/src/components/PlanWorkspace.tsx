"use client";

import PlanEditor from "@/components/PlanEditor";
import PlanAdjuster from "@/components/PlanAdjuster";
import PlanViewer from "@/components/PlanViewer";

export default function PlanWorkspace({
  planId,
  weeks,
  totalWeeks,
  generation,
  activeWeekIndex,
  initialDayIndex,
  editorOpen,
  onEditorOpenChange,
  coachOpen,
  onCoachOpenChange,
  onActiveWeekChange,
}: {
  planId: string;
  weeks: Parameters<typeof PlanViewer>[0]["weeks"];
  totalWeeks: number;
  generation: Parameters<typeof PlanViewer>[0]["generation"];
  activeWeekIndex: number;
  initialDayIndex: number;
  editorOpen: boolean;
  onEditorOpenChange: (open: boolean) => void;
  coachOpen: boolean;
  onCoachOpenChange: (open: boolean) => void;
  onActiveWeekChange: (index: number) => void;
}) {
  const activeWeek = weeks[activeWeekIndex] ?? null;

  return (
    <>
      {activeWeek && (
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
            isOpen={coachOpen}
            onOpenChange={onCoachOpenChange}
          />
        </>
      )}
      <PlanViewer
        planId={planId}
        weeks={weeks}
        totalWeeks={totalWeeks}
        generation={generation}
        initialWeekIndex={activeWeekIndex}
        initialDayIndex={initialDayIndex}
        activeWeekIndex={activeWeekIndex}
        onActiveWeekChange={onActiveWeekChange}
      />
    </>
  );
}
