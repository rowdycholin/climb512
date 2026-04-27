"use client";

import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { login } from "@/app/actions";
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
        <Label htmlFor="userId">User ID</Label>
        <Input id="userId" name="userId" placeholder="user ID or email" required autoComplete="username" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </>
  );
}

export default function LoginForm() {
  const [loginState, loginAction] = useFormState(login, null);

  return (
    <Card className="w-full max-w-md border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.14)] backdrop-blur">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-14 min-w-[5.6rem] flex-col items-center justify-center rounded-2xl border border-sky-200/80 bg-[linear-gradient(135deg,_#082f49,_#0f766e_55%,_#f59e0b)] px-4 text-[0.72rem] font-bold uppercase leading-none tracking-[0.16em] text-white shadow-[0_16px_40px_rgba(8,47,73,0.24)]">
          <span>climb</span>
          <span className="mt-1 text-sm tracking-[0.2em]">512</span>
        </div>
        <CardTitle className="text-3xl font-semibold text-slate-950">Climb512</CardTitle>
        <CardDescription>Sharpen your next block with a plan that feels coached, not generic.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={loginAction} className="space-y-4">
          <LoginFields error={loginState?.error ?? undefined} />
          <SubmitButton label="Sign In" pendingLabel="Signing in..." />
        </form>
        <div className="mt-5 border-t border-slate-200 pt-5 text-center text-sm text-slate-600">
          New to Climb512?{" "}
          <Link href="/register" className="font-medium text-slate-950 underline-offset-4 hover:underline">
            Register
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
