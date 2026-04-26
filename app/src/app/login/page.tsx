import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.16),_transparent_26%),linear-gradient(160deg,_#f8fafc,_#eef2ff_48%,_#ecfeff)] p-4">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:34px_34px] opacity-50" />
      <div className="relative flex w-full justify-center">
        <LoginForm />
      </div>
    </div>
  );
}
