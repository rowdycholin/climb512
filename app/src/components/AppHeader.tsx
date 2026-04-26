import AppMenu from "@/components/AppMenu";

export default function AppHeader({
  title,
  subtitle,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-white/60 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_34%),linear-gradient(135deg,_rgba(255,255,255,0.96),_rgba(241,245,249,0.94))] px-4 py-3 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 min-w-[4.5rem] items-center justify-center rounded-2xl border border-sky-200/80 bg-[linear-gradient(135deg,_#082f49,_#0f766e_55%,_#f59e0b)] px-3 text-[0.78rem] font-bold tracking-[0.16em] text-white shadow-[0_10px_30px_rgba(8,47,73,0.22)]">
            c512
          </div>
          <div>
            {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700/70">{eyebrow}</p>}
            <h1 className="leading-tight font-semibold text-slate-950">{title}</h1>
            {subtitle && <p className="text-sm text-slate-600">{subtitle}</p>}
          </div>
        </div>
        <AppMenu />
      </div>
    </header>
  );
}
