import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createPlan } from "@/app/actions";
import AppHeader from "@/components/AppHeader";
import DisciplineLevelFields from "@/components/DisciplineLevelFields";
import EquipmentPicker from "@/components/EquipmentPicker";
import GeneratePlanButton from "@/components/GeneratePlanButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageIntro, PageShell } from "@/components/ui/app-shell";

const GOALS = [
  { value: "send-project", label: "Send my project grade" },
  { value: "improve-finger", label: "Improve finger strength" },
  { value: "improve-endurance", label: "Build climbing endurance" },
  { value: "comp-training", label: "Train for competitions" },
  { value: "lose-weight", label: "Lose weight / get fitter" },
  { value: "injury-prevention", label: "Injury prevention and longevity" },
];

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session.isLoggedIn) redirect("/login");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        eyebrow="Onboarding"
        title="Climb512"
        subtitle="Build a training plan around your goals, grade, and available equipment."
      />

      <PageShell maxWidth="sm">
        <PageIntro
          eyebrow="Plan Setup"
          title="Build your training plan"
          description="Answer a few questions and we'll create a personalized plan that feels ready to use."
        />

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

          <DisciplineLevelFields />

          <Card>
            <CardHeader>
              <CardTitle>Training Schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input id="startDate" name="startDate" type="date" required defaultValue={today} className="max-w-[180px]" />
              </div>
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

          <EquipmentPicker />

          <GeneratePlanButton />
        </form>
      </PageShell>
    </div>
  );
}
