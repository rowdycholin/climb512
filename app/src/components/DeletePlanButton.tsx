"use client";

import { Button } from "@/components/ui/button";
import { deletePlan } from "@/app/actions";

export default function DeletePlanButton({ planId }: { planId: string }) {
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!confirm("Delete this plan?")) e.preventDefault();
  }

  return (
    <form action={deletePlan} onSubmit={handleSubmit} className="absolute top-2 right-2">
      <input type="hidden" name="planId" value={planId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-400 hover:bg-red-400/10 h-7 w-7 p-0"
      >
        ✕
      </Button>
    </form>
  );
}
