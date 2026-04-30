"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { register } from "@/app/actions";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
    >
      {pending ? "Creating account..." : "Create Account"}
    </button>
  );
}

export default function RegisterForm() {
  const [state, action] = useFormState(register, null);

  return (
    <Card className="w-full max-w-2xl border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.14)] backdrop-blur">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-14 min-w-[5.6rem] flex-col items-center justify-center rounded-2xl border border-sky-200/80 bg-[linear-gradient(135deg,_#082f49,_#0f766e_55%,_#f59e0b)] px-4 text-[0.72rem] font-bold uppercase leading-none tracking-[0.16em] text-white shadow-[0_16px_40px_rgba(8,47,73,0.24)]">
          <span>climb</span>
          <span className="mt-1 text-sm tracking-[0.2em]">512</span>
        </div>
        <h1 className="text-3xl font-semibold text-slate-950">Create Account</h1>
        <CardDescription>Set up your profile before building a training plan.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input id="firstName" name="firstName" required autoComplete="given-name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input id="lastName" name="lastName" required autoComplete="family-name" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="you@example.com" required autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="age">Age</Label>
              <Input id="age" name="age" type="number" min={13} max={100} required autoComplete="off" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gender">Gender</Label>
            <select
              id="gender"
              name="gender"
              required
              defaultValue="prefer_not_to_say"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="userId">User ID</Label>
            <Input id="userId" name="userId" placeholder="8+ characters, email is okay" required minLength={8} autoComplete="username" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="verifyPassword">Verify Password</Label>
              <Input id="verifyPassword" name="verifyPassword" type="password" required minLength={10} autoComplete="new-password" />
            </div>
          </div>

          <p className="text-sm text-slate-600">
            Passwords must be at least 10 characters and include uppercase, lowercase, numeric, and special characters.
          </p>

          {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
          <SubmitButton />
        </form>

        <div className="mt-5 border-t border-slate-200 pt-5 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-slate-950 underline-offset-4 hover:underline">
            Sign In
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
