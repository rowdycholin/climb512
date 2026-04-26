import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createPlan } from "@/app/actions";
import AppHeader from "@/components/AppHeader";
import EquipmentPicker from "@/components/EquipmentPicker";
import GeneratePlanButton from "@/components/GeneratePlanButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const GOALS = [
  { value: "send-project", label: "Send my project grade" },
  { value: "improve-finger", label: "Improve finger strength" },
  { value: "improve-endurance", label: "Build climbing endurance" },
  { value: "comp-training", label: "Train for competitions" },
  { value: "lose-weight", label: "Lose weight / get fitter" },
  { value: "injury-prevention", label: "Injury prevention and longevity" },
];

const GRADES = ["V0", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9", "V10+"];

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session.isLoggedIn) redirect("/login");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-50">
      <AppHeader
        eyebrow="Onboarding"
        title="Climb512"
        subtitle="Build a training plan around your goals, grade, and available equipment."
      />

      <main className="mx-auto max-w-2xl p-4 py-8">
        <div className="mb-8 overflow-hidden rounded-[1.6rem] border border-white/70 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_32%),linear-gradient(145deg,_rgba(255,255,255,0.98),_rgba(240,249,255,0.92)_48%,_rgba(255,251,235,0.9))] p-6 text-center shadow-[0_24px_60px_rgba(15,23,42,0.10)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700/70">Plan Setup</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Build Your Training Plan</h1>
          <p className="mt-2 text-sm text-slate-600">Answer a few questions and we&apos;ll create a personalized plan that feels ready to use.</p>
        </div>

        <form action={createPlan} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>What are your climbing goals?</CardTitle>
              <CardDescription>Select all that apply.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {GOALS.map((goal) => (
                <label
                  key={goal.value}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 transition-colors hover:bg-slate-50"
                >
                  <Checkbox name="goals" value={goal.value} />
                  <span className="text-sm">{goal.label}</span>
                </label>
              ))}
              <div className="sm:col-span-2">
                <Label htmlFor="customGoal" className="text-sm text-muted-foreground">Other goal (optional)</Label>
                <Input id="customGoal" name="customGoal" placeholder="e.g. climb outdoors this summer" className="mt-1" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your Level</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="currentGrade">Current Grade (V-scale)</Label>
                  <select
                    name="currentGrade"
                    id="currentGrade"
                    required
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Select...</option>
                    {GRADES.map((grade) => (
                      <option key={grade} value={grade}>{grade}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="targetGrade">Target Grade</Label>
                  <select
                    name="targetGrade"
                    id="targetGrade"
                    required
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Select...</option>
                    {GRADES.map((grade) => (
                      <option key={grade} value={grade}>{grade}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="age">Your Age</Label>
                <Input id="age" name="age" type="number" min="10" max="80" placeholder="e.g. 28" required className="max-w-[120px]" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Training Schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="weeksDuration">Plan Length (weeks)</Label>
                  <select
                    name="weeksDuration"
                    id="weeksDuration"
                    required
                    defaultValue="8"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="4">4 weeks</option>
                    <option value="8">8 weeks</option>
                    <option value="12">12 weeks</option>
                    <option value="16">16 weeks</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="daysPerWeek">Days Per Week</Label>
                  <select
                    name="daysPerWeek"
                    id="daysPerWeek"
                    required
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {[2, 3, 4, 5, 6].map((days) => (
                      <option key={days} value={days}>{days} days</option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Climbing Discipline</CardTitle>
              <CardDescription>What type of climbing do you primarily train for?</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { value: "bouldering", label: "Bouldering", desc: "Short powerful problems, V-scale" },
                { value: "sport", label: "Sport Climbing", desc: "Roped routes, endurance and redpointing" },
                { value: "trad", label: "Trad Climbing", desc: "Gear-protected routes and crack technique" },
                { value: "ice", label: "Ice Climbing", desc: "Tool swings, front-pointing, mixed" },
                { value: "alpine", label: "Alpine", desc: "Multi-pitch, altitude, endurance" },
              ].map((discipline) => (
                <label
                  key={discipline.value}
                  className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 transition-colors hover:bg-slate-50 has-[:checked]:border-primary has-[:checked]:bg-accent"
                >
                  <input type="radio" name="discipline" value={discipline.value} required className="mt-0.5 accent-primary" />
                  <div>
                    <div className="text-sm font-medium">{discipline.label}</div>
                    <div className="text-xs text-muted-foreground">{discipline.desc}</div>
                  </div>
                </label>
              ))}
            </CardContent>
          </Card>

          <EquipmentPicker />

          <GeneratePlanButton />
        </form>
      </main>
    </div>
  );
}
