"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import type { StopTimePattern } from "@/lib/types";
import { cn, formatRelativeTime, nowSecondsSinceMidnight } from "@/lib/utils";
import { LinePill } from "./LinePill";
import { Star, ChevronRight } from "lucide-react";

interface FavStopState {
  id: string;
  name: string;
  city?: string;
  passages: Array<{
    routeId: string;
    shortName: string;
    color: string;
    headsign: string;
    arriveSec: number;
    delaySec: number;
    realtime: boolean;
  }>;
}

export function FavStopsSection() {
  const { state, dispatch } = useApp();
  const [items, setItems] = useState<FavStopState[]>([]);

  useEffect(() => {
    if (state.favStops.length === 0) { setItems([]); return; }
    let cancel = false;
    const load = async () => {
      const results = await Promise.allSettled(
        state.favStops.map(async (id) => {
          const r = await fetch(`/api/stoptimes/${id}`);
          const data: StopTimePattern[] = await r.json();
          const name = data?.[0]?.times?.[0]?.stopName?.split(",").pop()?.trim() || id;
          const city = data?.[0]?.times?.[0]?.stopName?.split(",")[0]?.trim();
          const passages: FavStopState["passages"] = [];
          for (const p of data) {
            const route = state.routes.find((rr) => p.pattern.id.startsWith(`${rr.id}:`));
            if (!route) continue;
            for (const t of p.times.slice(0, 2)) {
              passages.push({
                routeId: route.id,
                shortName: route.shortName,
                color: route.color,
                headsign: p.pattern.lastStopName || p.pattern.shortDesc,
                arriveSec: t.realtimeArrival ?? t.scheduledArrival,
                delaySec: t.arrivalDelay ?? 0,
                realtime: t.realtime,
              });
            }
          }
          passages.sort((a, b) => a.arriveSec - b.arriveSec);
          return { id, name, city, passages: passages.slice(0, 4) };
        })
      );
      if (!cancel) {
        setItems(results.flatMap((r) => r.status === "fulfilled" ? [r.value] : []));
      }
    };
    load();
    const iv = setInterval(load, 20_000);
    return () => { cancel = true; clearInterval(iv); };
  }, [state.favStops, state.routes]);

  if (state.favStops.length === 0) return null;

  const now = nowSecondsSinceMidnight();

  return (
    <section className="rounded-2xl bg-elev shadow-soft border overflow-hidden">
      <header className="px-4 py-2.5 border-b flex items-center gap-2">
        <Star size={13} className="text-warning" fill="currentColor" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          Mes arrêts
        </span>
        <span className="ml-auto text-[10px] text-subtle tabular">{state.favStops.length}</span>
      </header>
      <ul className="divide-y">
        {items.map((it) => (
          <li key={it.id}>
            <button
              type="button"
              onClick={() => dispatch({ type: "SELECT_STOP", id: it.id })}
              className="w-full text-left px-4 py-2.5 hover:bg-surface transition-colors"
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-fg truncate">{it.name}</p>
                  {it.city && <p className="text-[11px] text-muted truncate">{it.city}</p>}
                </div>
                <ChevronRight size={14} className="text-subtle shrink-0" />
              </div>
              {it.passages.length === 0 ? (
                <p className="text-[11px] text-subtle italic">Aucun passage à venir</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {it.passages.map((p, i) => {
                    const sec = p.arriveSec - now;
                    const imm = sec < 90;
                    return (
                      <span
                        key={i}
                        className={cn(
                          "tabular text-[11px] font-medium px-1.5 h-6 rounded inline-flex items-center gap-1",
                          imm ? "bg-accent text-accent-fg" : "bg-surface border"
                        )}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-sm inline-flex items-center justify-center text-[8px] font-bold"
                          style={{ background: `#${p.color}`, color: "#fff" }}
                        >
                          {p.shortName}
                        </span>
                        {formatRelativeTime(Math.max(0, sec))}
                      </span>
                    );
                  })}
                </div>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
