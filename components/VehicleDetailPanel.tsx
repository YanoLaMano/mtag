"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import type { Vehicle, VehicleTripStop } from "@/lib/types";
import { cn, formatRelativeTime, nowSecondsSinceMidnight } from "@/lib/utils";
import { LinePill } from "./LinePill";
import { Crosshair, X, MapPin } from "lucide-react";

export function VehicleDetailPanel() {
  const { state, dispatch } = useApp();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const tickRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!state.selectedVehicleTripId || !state.selectedRouteId) {
      setVehicle(null);
      return;
    }
    let cancel = false;
    const load = async () => {
      const res = await fetch(`/api/vehicles/${state.selectedRouteId}`);
      const data = await res.json();
      if (cancel) return;
      const v = data.vehicles?.find((x: Vehicle) => x.tripId === state.selectedVehicleTripId);
      if (v) setVehicle(v); else setVehicle(null);
    };
    load();
    tickRef.current = setInterval(load, 8_000);
    return () => {
      cancel = true;
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [state.selectedVehicleTripId, state.selectedRouteId]);

  if (!state.selectedVehicleTripId || !vehicle) return null;
  const route = state.routes.find((r) => r.id === vehicle.routeId);
  if (!route) return null;

  const now = nowSecondsSinceMidnight();
  const stops = vehicle.tripStops ?? [];
  const upcoming = stops.filter((s) => !s.passed);
  const passed = stops.filter((s) => s.passed);
  const delayMin = Math.round(vehicle.delay / 60);

  return (
    <div className="absolute right-4 top-20 bottom-4 z-30 w-[380px] max-w-[calc(100vw-32px)] flex flex-col animate-slide-right">
      <div className="glass-strong rounded-2xl flex flex-col overflow-hidden h-full">
        <header className="p-4 pb-3 border-b flex items-start gap-3">
          <LinePill route={route} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
              {route.mode === "TRAM" ? "Tramway" : "Bus"} en direct
            </p>
            <h2 className="text-sm font-semibold leading-tight truncate">
              → {vehicle.headsign}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] text-muted tabular">
                {Math.round(vehicle.progress * 100)}% du trajet
              </span>
              <span className="text-subtle">·</span>
              <DelayChip delay={vehicle.delay} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: "SELECT_VEHICLE", tripId: null })}
            className="rounded-md p-1.5 hover:bg-surface transition-colors"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </header>

        <div className="px-4 py-2.5 border-b flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            {upcoming.length} arrêts restants
          </span>
          <button
            type="button"
            onClick={() => dispatch({ type: "TOGGLE_FOLLOW" })}
            className={cn(
              "h-8 px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-all",
              state.followVehicle
                ? "bg-accent text-accent-fg"
                : "bg-surface text-fg hover:bg-border"
            )}
          >
            <Crosshair size={13} className={cn(state.followVehicle && "animate-pulse")} />
            {state.followVehicle ? "Suivi actif" : "Suivre"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scroll-area p-2">
          <ol className="relative">
            {stops.map((s, i) => (
              <TripStopRow
                key={`${s.stopId}-${i}`}
                stop={s}
                color={`#${route.color}`}
                isFirst={i === 0}
                isLast={i === stops.length - 1}
                now={now}
              />
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function TripStopRow({
  stop, color, isFirst, isLast, now,
}: {
  stop: VehicleTripStop;
  color: string;
  isFirst: boolean;
  isLast: boolean;
  now: number;
}) {
  // stop.arrive is already RT-resolved upstream (interpolate.ts uses
  // realtimeArrival ?? scheduledArrival), so a stop.realtime ternary here
  // was selecting between identical values.
  const sec = stop.arrive - now;
  const future = sec >= -30;
  const isImminent = stop.isNext;
  return (
    <li className={cn(
      "relative flex items-stretch gap-3 px-2 py-2 rounded-lg",
      stop.isAtStop && "bg-accent/10",
      stop.passed && "opacity-50"
    )}>
      <div className="relative w-5 flex justify-center">
        {!isFirst && (
          <span
            className="absolute top-0 bottom-1/2 w-0.5"
            style={{ background: color, opacity: stop.passed ? 0.4 : 0.9 }}
          />
        )}
        {!isLast && (
          <span
            className="absolute top-1/2 bottom-0 w-0.5"
            style={{ background: color, opacity: stop.passed ? 0.4 : 0.9 }}
          />
        )}
        <span
          className={cn(
            "relative shrink-0",
            stop.isAtStop ? "w-4 h-4" : isImminent ? "w-3.5 h-3.5" : "w-2.5 h-2.5",
          )}
        >
          <span
            className="block w-full h-full rounded-full border-[2.5px] bg-white"
            style={{ borderColor: color }}
          />
          {stop.isAtStop && (
            <span
              className="absolute inset-0 rounded-full animate-pulse-ring"
              style={{ background: color, opacity: 0.4 }}
            />
          )}
        </span>
      </div>
      <div className="flex-1 min-w-0 flex items-center justify-between gap-2 py-0.5">
        <div className="min-w-0">
          <p className={cn(
            "text-sm leading-tight truncate",
            stop.isAtStop || isImminent ? "font-semibold text-fg" : "text-fg"
          )}>
            {stop.name}
          </p>
          {stop.isAtStop && (
            <p className="text-[11px] font-medium text-accent mt-0.5">
              <MapPin size={10} className="inline -mt-0.5" /> à l'arrêt
            </p>
          )}
        </div>
        {future && !stop.passed && (
          <span className={cn(
            "tabular text-xs font-medium px-1.5 py-0.5 rounded shrink-0",
            isImminent ? "bg-accent text-accent-fg" : "text-muted"
          )}>
            {formatRelativeTime(Math.max(0, sec))}
          </span>
        )}
      </div>
    </li>
  );
}

function DelayChip({ delay }: { delay: number }) {
  if (!delay || Math.abs(delay) < 30) {
    return <span className="text-[10px] font-semibold text-success">À l'heure</span>;
  }
  const min = Math.round(delay / 60);
  return (
    <span className={cn("text-[10px] font-bold tabular", min > 0 ? "text-danger" : "text-success")}>
      {min > 0 ? "+" : ""}{min} min
    </span>
  );
}
