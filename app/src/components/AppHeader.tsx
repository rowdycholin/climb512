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
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 min-w-16 items-center justify-center rounded-lg bg-slate-950 px-3 text-[0.78rem] font-bold tracking-[0.14em] text-white shadow-sm">
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
