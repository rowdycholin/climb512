"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { List, LogOut, Menu, MessageCircle, Wrench, X } from "lucide-react";
import { logout } from "@/app/actions";
import { Button } from "@/components/ui/button";

export default function AppMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
        className="border-white/70 bg-white/80 text-slate-700 shadow-sm backdrop-blur hover:bg-white"
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </Button>

      {open && (
        <div className="absolute right-0 top-11 z-30 w-56 rounded-2xl border border-slate-200/80 bg-white/95 p-2 shadow-[0_20px_50px_rgba(15,23,42,0.18)] backdrop-blur">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
            onClick={() => setOpen(false)}
          >
            <List className="h-4 w-4" />
            My Plans
          </Link>
          <Link
            href="/intake"
            className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
            onClick={() => setOpen(false)}
          >
            <MessageCircle className="h-4 w-4" />
            AI Chat
          </Link>
          <Link
            href="/onboarding"
            className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
            onClick={() => setOpen(false)}
          >
            <Wrench className="h-4 w-4" />
            Manual Setup
          </Link>
          <form action={logout} className="mt-1">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
