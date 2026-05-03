import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageShellProps = {
  children: ReactNode;
  maxWidth?: "sm" | "md" | "lg";
  className?: string;
  contentClassName?: string;
};

const pageWidth = {
  sm: "max-w-2xl",
  md: "max-w-3xl",
  lg: "max-w-5xl",
};

export function PageShell({ children, maxWidth = "md", className, contentClassName }: PageShellProps) {
  return (
    <main className={cn("mx-auto p-4 py-8", pageWidth[maxWidth], className, contentClassName)}>
      {children}
    </main>
  );
}

type PageIntroProps = {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function PageIntro({ eyebrow, title, description, action, className }: PageIntroProps) {
  return (
    <section className={cn("mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
              {eyebrow}
            </p>
          )}
          <h1 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">{title}</h1>
          {description && <div className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">{description}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </section>
  );
}

type SectionPanelProps = {
  children: ReactNode;
  className?: string;
  padded?: boolean;
};

export function SectionPanel({ children, className, padded = true }: SectionPanelProps) {
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", padded && "p-4", className)}>
      {children}
    </section>
  );
}

export function CommandBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-end gap-2", className)}>
      {children}
    </div>
  );
}

type StatusBannerProps = {
  tone?: "info" | "success" | "warning" | "danger" | "neutral";
  children: ReactNode;
  className?: string;
};

const statusBannerTone = {
  info: "border-sky-200 bg-sky-50 text-sky-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-red-200 bg-red-50 text-red-800",
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
};

export function StatusBanner({ tone = "neutral", children, className }: StatusBannerProps) {
  return (
    <div className={cn("rounded-lg border px-3 py-2 text-sm", statusBannerTone[tone], className)}>
      {children}
    </div>
  );
}
