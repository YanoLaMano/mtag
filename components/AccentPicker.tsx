"use client";
import { useEffect, useRef, useState } from "react";
import { useApp, ACCENT_VALUES, type Accent } from "@/lib/store";
import { Palette, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function AccentPicker() {
  const { state, dispatch } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const current = ACCENT_VALUES[state.accent];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-10 w-10 rounded-2xl glass inline-flex items-center justify-center hover:bg-surface transition-colors btn-press ripple"
        aria-label="Couleur d'accent"
        aria-expanded={open ? "true" : "false"}
      >
        <span
          className="w-4 h-4 rounded-full"
          style={{
            background: `hsl(${current.h} ${current.s}% ${current.l}%)`,
            boxShadow: `0 0 0 2px hsl(var(--elev)), 0 0 0 3px hsl(${current.h} ${current.s}% ${current.l}%)`,
          }}
        />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 glass-strong rounded-2xl p-1.5 animate-fade-up z-40">
          <div className="px-3 pt-2 pb-1 text-overline flex items-center gap-1.5">
            <Palette size={11} /> Couleur d'accent
          </div>
          {(Object.keys(ACCENT_VALUES) as Accent[]).map((key) => {
            const v = ACCENT_VALUES[key];
            const active = state.accent === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => { dispatch({ type: "SET_ACCENT", accent: key }); setOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-colors",
                  active ? "bg-surface" : "hover:bg-surface/60"
                )}
              >
                <span
                  className="w-5 h-5 rounded-full shrink-0"
                  style={{
                    background: `hsl(${v.h} ${v.s}% ${v.l}%)`,
                    boxShadow: `0 0 0 1.5px hsl(var(--elev)), 0 0 0 2.5px hsl(${v.h} ${v.s}% ${v.l}%)`,
                  }}
                />
                <span className="flex-1 text-body">{v.label}</span>
                {active && <Check size={14} className="text-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
