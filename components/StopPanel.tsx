"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import type { StopTimePattern } from "@/lib/types";
import { formatRelativeTime, nowSecondsSinceMidnight, cn } from "@/lib/utils";
import { ArrowRight, Star, X } from "lucide-react";
import { LinePill } from "./LinePill";

export function StopPanel() {
  const { state, dispatch } = useApp();
  const [data, setData] = useState<StopTimePattern[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!state.selectedStopId) { setData(null); return; }
    let cancel = false;
    setLoading(true);
    const load = () =>
      fetch(`/api/stoptimes/${state.selectedStopId}`)
        .then((r) => r.json())
        .then((d) => { if (!cancel) setData(d); })
        .finally(() => !cancel && setLoading(false));
    load();
    const iv = setInterval(load, 20_000);
    return () => { cancel = true; clearInterval(iv); };
  }, [state.selectedStopId]);

  if (!state.selectedStopId) return null;

  const route = state.routes.find((r) => r.id === state.selectedRouteId);
  const now = nowSecondsSinceMidnight();
  const stopName = data?.[0]?.times?.[0]?.stopName ?? "Arrêt";

  return (
    <div className="absolute right-4 top-4 bottom-4 w-[360px] max-w-[calc(100vw-32px)] z-20 animate-slide-right">
      <div className="h-full glass-strong rounded-2xl flex flex-col overflow-hidden">
        <header className="p-4 pb-3 border-b flex items-start gap-3">
          {route && <LinePill route={route} />}
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold leading-tight truncate">{stopName}</h2>
            <p className="text-xs text-muted mt-0.5">Prochains passages · temps réel</p>
          </div>
          <button
            type="button"
            onClick={() => state.selectedStopId && dispatch({ type: "TOGGLE_FAV_STOP", id: state.selectedStopId })}
            className={cn(
              "rounded-md p-1.5 transition-colors",
              state.favStops.includes(state.selectedStopId ?? "")
                ? "text-warning bg-warning/10"
                : "text-subtle hover:bg-surface hover:text-warning"
            )}
            aria-label="Mettre en favori"
          >
            <Star size={16} fill={state.favStops.includes(state.selectedStopId ?? "") ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "SELECT_STOP", id: null })}
            className="rounded-md p-1.5 hover:bg-surface transition-colors"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto scroll-area p-2">
          {loading && !data ? (
            <div className="space-y-2 p-2">
              {[1,2,3,4].map((i) => (
                <div key={i} className="h-14 rounded-lg skeleton" />
              ))}
            </div>
          ) : !data || data.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">
              Aucun passage prévu.
            </div>
          ) : (
            data.map((p, i) => (
              <PatternBlock key={i} pattern={p} now={now} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function PatternBlock({ pattern, now }: { pattern: StopTimePattern; now: number }) {
  const { state } = useApp();
  const route = state.routes.find((r) => pattern.pattern.id.startsWith(`${r.id}:`));
  const futureTimes = pattern.times
    .filter((t) => (t.realtimeArrival ?? t.scheduledArrival) >= now - 60)
    .slice(0, 6);
  if (!futureTimes.length) return null;
  return (
    <div className="p-3 rounded-xl hover:bg-surface/60 transition-colors">
      <div className="flex items-center gap-2 mb-2.5">
        {route && <LinePill route={route} size="sm" />}
        <ArrowRight size={12} className="text-subtle" />
        <span className="text-xs font-medium text-fg truncate">
          {pattern.pattern.lastStopName}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {futureTimes.map((t, i) => {
          const sec = (t.realtimeArrival ?? t.scheduledArrival) - now;
          const isRT = t.realtime;
          const isImminent = sec < 90;
          const delayMin = Math.round((t.arrivalDelay ?? 0) / 60);
          return (
            <span
              key={i}
              className={cn(
                "tabular text-xs font-medium px-2 py-1 rounded-md inline-flex items-center gap-1",
                isImminent
                  ? "bg-accent text-accent-fg"
                  : "bg-surface text-fg border"
              )}
              title={delayMin !== 0 ? `Retard ${delayMin > 0 ? "+" : ""}${delayMin} min` : "À l'heure"}
            >
              {isRT && (
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    isImminent ? "bg-white" : "bg-success animate-pulse"
                  )}
                />
              )}
              {formatRelativeTime(Math.max(0, sec))}
              {delayMin > 0 && (
                <span className={cn("ml-0.5 font-semibold", isImminent ? "opacity-80" : "text-danger")}>
                  +{delayMin}
                </span>
              )}
              {delayMin < 0 && (
                <span className={cn("ml-0.5 font-semibold", isImminent ? "opacity-80" : "text-success")}>
                  {delayMin}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
