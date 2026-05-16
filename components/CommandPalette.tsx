"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { LinePill } from "./LinePill";
import { Search, ArrowRight, Star, Moon, Sun, Flame, Route as RouteIcon, X, Locate } from "lucide-react";
import { cn } from "@/lib/utils";

interface Action {
  id: string;
  label: string;
  description?: string;
  group: "Lignes" | "Actions" | "Vues";
  icon?: any;
  pill?: { shortName: string; color: string; textColor: string };
  perform: () => void;
}

export function CommandPalette() {
  const { state, dispatch } = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // ⌘K / Ctrl-K shortcut + Escape close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQ("");
        setActiveIdx(0);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      } else if (e.key === "/" && !open && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      // focus input on open
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const actions = useMemo<Action[]>(() => {
    const lineActions = state.routes.map<Action>((r) => ({
      id: `line-${r.id}`,
      label: `${r.shortName} — ${r.longName}`,
      description: r.mode === "TRAM" ? "Tramway" : r.type === "CHRONO" ? "Chrono" : r.type === "PROXIMO" ? "Proximo" : "Bus",
      group: "Lignes" as const,
      pill: { shortName: r.shortName, color: r.color, textColor: r.textColor },
      perform: () => { dispatch({ type: "SELECT_ROUTE", id: r.id }); setOpen(false); },
    }));
    const general: Action[] = [
      {
        id: "near-me",
        label: "Arrêts près de moi",
        group: "Actions",
        icon: Locate,
        perform: () => {
          setOpen(false);
          // FAB will be triggered manually; just close. Could dispatch a custom event.
          const evt = new CustomEvent("m-near-me");
          window.dispatchEvent(evt);
        },
      },
      {
        id: "trip",
        label: "Calculer un itinéraire",
        group: "Actions",
        icon: RouteIcon,
        perform: () => { dispatch({ type: "TOGGLE_TRIP" }); setOpen(false); },
      },
      {
        id: "heatmap",
        label: state.showHeatmap ? "Désactiver la heatmap" : "Activer la heatmap",
        group: "Vues",
        icon: Flame,
        perform: () => { dispatch({ type: "TOGGLE_HEATMAP" }); setOpen(false); },
      },
      {
        id: "theme",
        label: state.theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre",
        group: "Vues",
        icon: state.theme === "dark" ? Sun : Moon,
        perform: () => {
          dispatch({ type: "SET_THEME", theme: state.theme === "dark" ? "light" : "dark" });
          setOpen(false);
        },
      },
    ];
    return [...general, ...lineActions];
  }, [state.routes, state.theme, state.showHeatmap, dispatch]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return actions;
    return actions.filter((a) =>
      a.label.toLowerCase().includes(term) ||
      (a.description?.toLowerCase().includes(term) ?? false) ||
      (a.pill?.shortName.toLowerCase().includes(term) ?? false)
    );
  }, [q, actions]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Action[]>();
    for (const a of filtered) {
      const g = groups.get(a.group) ?? [];
      g.push(a);
      groups.set(a.group, g);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  useEffect(() => setActiveIdx(0), [q]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(filtered.length - 1, i + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)); }
    if (e.key === "Enter") { e.preventDefault(); filtered[activeIdx]?.perform(); }
  };

  // scroll active into view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  if (!open) return null;
  let runningIdx = -1;
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center p-4 sm:p-12">
      <div
        className="absolute inset-0 bg-fg/30 backdrop-blur-sm animate-scale-in"
        onClick={() => setOpen(false)}
      />
      <div className="relative w-full max-w-xl glass-strong rounded-2xl overflow-hidden animate-fade-up">
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Search size={16} className="text-subtle" />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Rechercher une ligne, une action…"
            className="flex-1 bg-transparent border-0 outline-none text-headline text-fg placeholder:text-subtle"
          />
          <kbd>esc</kbd>
        </div>
        <ul ref={listRef} className="max-h-[60vh] overflow-y-auto scroll-area p-2">
          {grouped.length === 0 && (
            <li className="px-3 py-8 text-center text-caption">Aucun résultat</li>
          )}
          {grouped.map(([group, items]) => (
            <li key={group}>
              <div className="px-3 pt-2 pb-1 text-overline">{group}</div>
              <ul>
                {items.map((a) => {
                  runningIdx++;
                  const idx = runningIdx;
                  const active = idx === activeIdx;
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        data-idx={idx}
                        onMouseEnter={() => setActiveIdx(idx)}
                        onClick={a.perform}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-body transition-colors",
                          active ? "bg-accent/10" : "hover:bg-surface"
                        )}
                      >
                        {a.pill ? (
                          <LinePill route={{ ...(state.routes.find((r) => r.shortName === a.pill!.shortName) as any) }} size="sm" />
                        ) : a.icon ? (
                          <span className={cn("w-7 h-7 rounded-md inline-flex items-center justify-center", active ? "bg-accent/15 text-accent" : "bg-surface text-fg")}>
                            <a.icon size={14} />
                          </span>
                        ) : null}
                        <div className="flex-1 min-w-0">
                          <p className="text-headline truncate">{a.label}</p>
                          {a.description && <p className="text-caption truncate">{a.description}</p>}
                        </div>
                        {active && <ArrowRight size={14} className="text-accent shrink-0" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
        <footer className="px-4 py-2 border-t flex items-center gap-3 text-caption">
          <span className="flex items-center gap-1.5"><kbd>↑</kbd><kbd>↓</kbd>naviguer</span>
          <span className="flex items-center gap-1.5"><kbd>↵</kbd>valider</span>
          <span className="ml-auto flex items-center gap-1.5"><kbd>⌘</kbd><kbd>K</kbd></span>
        </footer>
      </div>
    </div>
  );
}
