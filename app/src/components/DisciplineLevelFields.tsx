"use client";

import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";

const DISCIPLINES = [
  { value: "bouldering", label: "Bouldering", desc: "Short powerful problems, V-scale" },
  { value: "sport", label: "Sport Climbing", desc: "Roped routes, endurance and redpointing" },
  { value: "trad", label: "Trad Climbing", desc: "Gear-protected routes and crack technique" },
  { value: "ice", label: "Ice Climbing", desc: "Tool swings, front-pointing, mixed" },
  { value: "alpine", label: "Alpine", desc: "Multi-pitch, altitude, endurance" },
];

const V_GRADES = ["V0", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9", "V10+"];

const YDS_GRADES = [
  "5.0",
  "5.1",
  "5.2",
  "5.3",
  "5.4",
  "5.5",
  "5.6",
  "5.7",
  "5.8",
  "5.9",
  ...["10", "11", "12", "13", "14", "15"].flatMap((grade) => ["a", "b", "c", "d"].map((suffix) => `5.${grade}${suffix}`)),
];

const WI_GRADES = ["WI2", ...[3, 4, 5, 6, 7].flatMap((grade) => [`WI${grade}-`, `WI${grade}`, `WI${grade}+`])];

function getGradeOptions(discipline: string) {
  if (discipline === "ice") return { label: "WI grade", options: WI_GRADES };
  if (discipline === "bouldering") return { label: "V-scale", options: V_GRADES };
  return { label: "YDS grade", options: YDS_GRADES };
}

export default function DisciplineLevelFields() {
  const [discipline, setDiscipline] = useState("bouldering");
  const gradeSet = useMemo(() => getGradeOptions(discipline), [discipline]);

  return (
    <>
      <section className="rounded-xl border bg-card text-card-foreground shadow-sm">
        <div className="flex flex-col space-y-1.5 p-6">
          <h2 className="text-2xl font-semibold leading-none tracking-tight">Climbing Discipline</h2>
          <p className="text-sm text-muted-foreground">What type of climbing do you primarily train for?</p>
        </div>
        <div className="grid grid-cols-1 gap-3 p-6 pt-0 sm:grid-cols-2">
          {DISCIPLINES.map((item) => (
            <label
              key={item.value}
              className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 transition-colors hover:bg-slate-50 has-[:checked]:border-primary has-[:checked]:bg-accent"
            >
              <input
                type="radio"
                name="discipline"
                value={item.value}
                required
                checked={discipline === item.value}
                onChange={() => setDiscipline(item.value)}
                className="mt-0.5 accent-primary"
              />
              <div>
                <div className="text-sm font-medium">{item.label}</div>
                <div className="text-xs text-muted-foreground">{item.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-card text-card-foreground shadow-sm">
        <div className="flex flex-col space-y-1.5 p-6">
          <h2 className="text-2xl font-semibold leading-none tracking-tight">Your Level</h2>
        </div>
        <div className="space-y-4 p-6 pt-0">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="currentGrade">Current Grade ({gradeSet.label})</Label>
              <select
                key={`current-${discipline}`}
                name="currentGrade"
                id="currentGrade"
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select...</option>
                {gradeSet.options.map((grade) => (
                  <option key={grade} value={grade}>{grade}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="targetGrade">Target Grade</Label>
              <select
                key={`target-${discipline}`}
                name="targetGrade"
                id="targetGrade"
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select...</option>
                {gradeSet.options.map((grade) => (
                  <option key={grade} value={grade}>{grade}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
