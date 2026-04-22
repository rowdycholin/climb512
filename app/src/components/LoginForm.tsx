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
    <button type="submit" disabled={pending}
      className="inline-flex items-center justify-center w-full h-10 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
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
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="text-4xl mb-2">🧗</div>
        <CardTitle className="text-2xl">Climb512</CardTitle>
        <CardDescription>AI-powered climbing training plans</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex rounded-lg bg-muted p-1 mb-6">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${mode === "login" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${mode === "register" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
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
