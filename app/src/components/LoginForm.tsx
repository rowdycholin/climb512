"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { login, register } from "@/app/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function LoginFields({ error }: { error?: string }) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input id="username" name="username" placeholder="username" required autoComplete="username" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </>
  );
}

function RegisterFields({ error }: { error?: string }) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input id="username" name="username" placeholder="username (min 3 chars)" required autoComplete="username" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" placeholder="min 8 characters" required autoComplete="new-password" />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </>
  );
}

export default function LoginForm() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loginState, loginAction] = useFormState(login, null);
  const [registerState, registerAction] = useFormState(register, null);

  return (
    <Card className="w-full max-w-md border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.14)] backdrop-blur">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-14 min-w-[5.6rem] items-center justify-center rounded-2xl border border-sky-200/80 bg-[linear-gradient(135deg,_#082f49,_#0f766e_55%,_#f59e0b)] px-4 text-sm font-bold tracking-[0.18em] text-white shadow-[0_16px_40px_rgba(8,47,73,0.24)]">
          c512
        </div>
        <CardTitle className="text-3xl font-semibold text-slate-950">Climb512</CardTitle>
        <CardDescription>Sharpen your next block with a plan that feels coached, not generic.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-6 flex rounded-xl bg-slate-100 p-1.5">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${mode === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${mode === "register" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
          >
            Register
          </button>
        </div>

        {mode === "login" ? (
          <form action={loginAction} className="space-y-4">
            <LoginFields error={loginState?.error ?? undefined} />
            <SubmitButton label="Sign In" pendingLabel="Signing in..." />
          </form>
        ) : (
          <form action={registerAction} className="space-y-4">
            <RegisterFields error={registerState?.error ?? undefined} />
            <SubmitButton label="Create Account" pendingLabel="Creating account..." />
          </form>
        )}
      </CardContent>
    </Card>
  );
}
