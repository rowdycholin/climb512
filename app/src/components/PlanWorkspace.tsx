"use client";

import { useState } from "react";
import PlanEditor from "@/components/PlanEditor";
import PlanAdjuster from "@/components/PlanAdjuster";
import PlanViewer from "@/components/PlanViewer";

export default function PlanWorkspace({
  planId,
  weeks,
  initialWeekIndex,
  initialDayIndex,
}: {
  planId: string;
  weeks: Parameters<typeof PlanViewer>[0]["weeks"];
  initialWeekIndex: number;
  initialDayIndex: number;
}) {
  const [activeWeekIndex, setActiveWeekIndex] = useState(initialWeekIndex);

  return (
    <>
      <PlanEditor planId={planId} week={weeks[activeWeekIndex]} />
      <PlanAdjuster planId={planId} week={weeks[activeWeekIndex]} />
      <PlanViewer
        planId={planId}
        weeks={weeks}
        initialWeekIndex={initialWeekIndex}
        initialDayIndex={initialDayIndex}
        activeWeekIndex={activeWeekIndex}
        onActiveWeekChange={setActiveWeekIndex}
      />
    </>
  );
}
