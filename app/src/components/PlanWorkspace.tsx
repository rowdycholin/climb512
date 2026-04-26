"use client";

import PlanEditor from "@/components/PlanEditor";
import PlanAdjuster from "@/components/PlanAdjuster";
import PlanViewer from "@/components/PlanViewer";

export default function PlanWorkspace({
  planId,
  weeks,
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
  activeWeekIndex: number;
  initialDayIndex: number;
  editorOpen: boolean;
  onEditorOpenChange: (open: boolean) => void;
  coachOpen: boolean;
  onCoachOpenChange: (open: boolean) => void;
  onActiveWeekChange: (index: number) => void;
}) {
  return (
    <>
      <PlanEditor
        planId={planId}
        week={weeks[activeWeekIndex]}
        isOpen={editorOpen}
        onOpenChange={onEditorOpenChange}
      />
      <PlanAdjuster
        planId={planId}
        week={weeks[activeWeekIndex]}
        isOpen={coachOpen}
        onOpenChange={onCoachOpenChange}
      />
      <PlanViewer
        planId={planId}
        weeks={weeks}
        initialWeekIndex={activeWeekIndex}
        initialDayIndex={initialDayIndex}
        activeWeekIndex={activeWeekIndex}
        onActiveWeekChange={onActiveWeekChange}
      />
    </>
  );
}
