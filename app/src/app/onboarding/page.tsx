import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createPlan, logout } from "@/app/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import EquipmentPicker from "@/components/EquipmentPicker";
import GeneratePlanButton from "@/components/GeneratePlanButton";

const GOALS = [
  { value: "send-project", label: "Send my project grade" },
  { value: "improve-finger", label: "Improve finger strength" },
  { value: "improve-endurance", label: "Build climbing endurance" },
  { value: "comp-training", label: "Train for competitions" },
  { value: "lose-weight", label: "Lose weight / get fitter" },
  { value: "injury-prevention", label: "Injury prevention & longevity" },
];

const GRADES = ["V0", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9", "V10+"];

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session.isLoggedIn) redirect("/login");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <header className="sticky top-0 z-10 bg-slate-900/90 backdrop-blur border-b border-slate-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🧗</span>
          <span className="font-bold text-white">Climb512</span>
        </div>
        <div className="flex items-center gap-2">
          <a href="/dashboard"><Button variant="ghost" size="sm">My Plans</Button></a>
          <form action={logout}><Button variant="ghost" size="sm" type="submit">Logout</Button></form>
        </div>
      </header>
      <div className="p-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🧗</div>
          <h1 className="text-3xl font-bold text-white">Build Your Training Plan</h1>
          <p className="text-slate-400 mt-2">Answer a few questions and we&apos;ll create a personalised plan</p>
        </div>

        <form action={createPlan} className="space-y-6">
          {/* Goals */}
          <Card>
            <CardHeader>
              <CardTitle>What are your climbing goals?</CardTitle>
              <CardDescription>Select all that apply</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {GOALS.map((g) => (
                <label key={g.value} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent transition-colors">
                  <Checkbox name="goals" value={g.value} />
                  <span className="text-sm">{g.label}</span>
                </label>
              ))}
              <div className="sm:col-span-2">
                <Label htmlFor="customGoal" className="text-sm text-muted-foreground">Other goal (optional)</Label>
                <Input id="customGoal" name="customGoal" placeholder="e.g. climb outdoors this summer" className="mt-1" />
              </div>
            </CardContent>
          </Card>

          {/* Level & Age */}
          <Card>
            <CardHeader>
              <CardTitle>Your Level</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="currentGrade">Current Grade (V-scale)</Label>
                  <select name="currentGrade" id="currentGrade" required
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="">Select...</option>
                    {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="targetGrade">Target Grade</Label>
                  <select name="targetGrade" id="targetGrade" required
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="">Select...</option>
                    {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="age">Your Age</Label>
                <Input id="age" name="age" type="number" min="10" max="80" placeholder="e.g. 28" required className="max-w-[120px]" />
              </div>
            </CardContent>
          </Card>

          {/* Training Duration */}
          <Card>
            <CardHeader>
              <CardTitle>Training Schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="weeksDuration">Plan Length (weeks)</Label>
                  <select name="weeksDuration" id="weeksDuration" required
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="4">4 weeks</option>
                    <option value="8" selected>8 weeks</option>
                    <option value="12">12 weeks</option>
                    <option value="16">16 weeks</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="daysPerWeek">Days Per Week</Label>
                  <select name="daysPerWeek" id="daysPerWeek" required
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {[2, 3, 4, 5, 6].map((d) => (
                      <option key={d} value={d}>{d} days</option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Discipline */}
          <Card>
            <CardHeader>
              <CardTitle>Climbing Discipline</CardTitle>
              <CardDescription>What type of climbing do you primarily train for?</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { value: "bouldering", label: "Bouldering", desc: "Short powerful problems, V-scale" },
                { value: "sport", label: "Sport Climbing", desc: "Roped routes, endurance & redpointing" },
                { value: "trad", label: "Trad Climbing", desc: "Gear-protected routes, crack technique" },
                { value: "ice", label: "Ice Climbing", desc: "Tool swings, front-pointing, mixed" },
                { value: "alpine", label: "Alpine", desc: "Multi-pitch, altitude, endurance" },
              ].map((d) => (
                <label key={d.value} className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent transition-colors has-[:checked]:border-primary has-[:checked]:bg-accent">
                  <input type="radio" name="discipline" value={d.value} required className="mt-0.5 accent-primary" />
                  <div>
                    <div className="text-sm font-medium">{d.label}</div>
                    <div className="text-xs text-muted-foreground">{d.desc}</div>
                  </div>
                </label>
              ))}
            </CardContent>
          </Card>

          {/* Equipment */}
          <EquipmentPicker />

          <GeneratePlanButton />
        </form>
      </div>
      </div>
    </div>
  );
}
