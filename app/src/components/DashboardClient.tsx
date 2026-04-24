"use client";

import { useState } from "react";
import { deletePlans } from "@/app/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Plan {
  id: string;
  title: string;
  createdAt: Date;
  profile: {
    currentGrade: string;
    targetGrade: string;
    weeksDuration: number;
    daysPerWeek: number;
  };
}

export default function DashboardClient({ plans }: { plans: Plan[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-700">Previous Plans</h2>
        {selected.size > 0 && (
          <form action={deletePlans}>
            {Array.from(selected).map((id) => (
              <input key={id} type="hidden" name="planIds" value={id} />
            ))}
            <Button
              type="submit"
              size="sm"
              variant="destructive"
              onClick={(event) => {
                if (!confirm(`Delete ${selected.size} plan${selected.size > 1 ? "s" : ""}?`)) {
                  event.preventDefault();
                }
              }}
            >
              Delete Selected ({selected.size})
            </Button>
          </form>
        )}
      </div>

      {plans.map((plan) => (
        <div key={plan.id} className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={selected.has(plan.id)}
            onChange={() => toggle(plan.id)}
            className="h-4 w-4 flex-shrink-0 cursor-pointer rounded border-slate-300 accent-primary"
            aria-label={`Select plan ${plan.title}`}
          />
          <a href={`/plan/${plan.id}`} className="min-w-0 flex-1">
            <Card className="cursor-pointer border-slate-200 bg-white shadow-sm transition-colors hover:bg-slate-50">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-800">{plan.title}</p>
                    <p className="text-sm text-slate-500">
                      {plan.profile.weeksDuration} weeks · {plan.profile.daysPerWeek} days/week
                    </p>
                  </div>
                  <p className="text-xs text-slate-400">{new Date(plan.createdAt).toLocaleDateString()}</p>
                </div>
              </CardContent>
            </Card>
          </a>
        </div>
      ))}
    </div>
  );
}
