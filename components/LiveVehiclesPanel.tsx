"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import type { Vehicle } from "@/lib/types";
import { cn, formatRelativeTime, nowSecondsSinceMidnight, tripProgress } from "@/lib/utils";
import { Bus, ChevronRight, Clock, MapPin, Radio, TrainFront } from "lucide-react";
import { LinePill } from "./LinePill";

export function LiveVehiclesPanel() {
  const { state } = useApp();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  // Tick once a second so the live-progress derivation re-renders.
  const [nowSec, setNowSec] = useState(0);
  useEffect(() => {
    setNowSec(nowSecondsSinceMidnight());
    const iv = setInterval(() => setNowSec(nowSecondsSinceMidnight()), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!state.selectedRouteId) { setVehicles([]); return; }
    let cancel = false;
    setLoading(true);
    const load = async () => {
      try {
        const res = await fetch(`/api/vehicles/${state.selectedRouteId}`);
        const data = await res.json();
        if (!cancel) {
          setVehicles(data.vehicles || []);
          setLastUpdate(Date.now());
        }
      } catch {} finally {
        if (!cancel) setLoading(false);
      }
    };
    load();
    const iv = setInterval(load, 12_000);
    return () => { cancel = true; clearInterval(iv); };
  }, [state.selectedRouteId]);

  const route = state.routes.find((r) => r.id === state.selectedRouteId);
  if (!route || !state.selectedRouteId) return null;
  if (state.selectedStopId) return null;            // StopPanel takes over
  if (state.selectedVehicleTripId) return null;    // VehicleDetailPanel takes over

  // Group by direction (headsign)
  const byHeadsign = new Map<string, Vehicle[]>();
  for (const v of vehicles) {
    const list = byHeadsign.get(v.headsign) ?? [];
    list.push(v);
    byHeadsign.set(v.headsign, list);
  }

  return (
    <div className="absolute right-4 top-20 z-20 w-[340px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-160px)] flex flex-col animate-fade-up">
      <div className="bg-elev/95 backdrop-blur-md rounded-2xl shadow-pop border flex flex-col overflow-hidden">
        <header className="px-4 py-3 border-b flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-surface inline-flex items-center justify-center">
            {route.mode === "TRAM" ? (
              <TrainFront size={16} className="text-fg" />
            ) : (
              <Bus size={16} className="text-fg" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
              Véhicules en circulation
            </p>
            <h3 className="text-sm font-semibold tabular leading-tight">
              {vehicles.length} {vehicles.length > 1 ? "actifs" : "actif"}
            </h3>
          </div>
          <FreshnessDot lastUpdate={lastUpdate} loading={loading} />
        </header>

        <div className="flex-1 overflow-y-auto scroll-area max-h-[400px]">
          {loading && vehicles.length === 0 ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg skeleton" />)}
            </div>
          ) : vehicles.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">
              Aucun véhicule en circulation actuellement.
            </div>
          ) : (
            Array.from(byHeadsign.entries()).map(([headsign, vs]) => (
              <DirectionGroup key={headsign} headsign={headsign} vehicles={vs} route={route} nowSec={nowSec} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function DirectionGroup({
  headsign, vehicles, route, nowSec,
}: { headsign: string; vehicles: Vehicle[]; route: any; nowSec: number }) {
  return (
    <div className="border-b last:border-b-0">
      <div className="px-4 py-2 flex items-center gap-2 bg-surface/40">
        <LinePill route={route} size="sm" />
        <ChevronRight size={12} className="text-subtle" />
        <span className="text-xs font-medium truncate flex-1">{headsign}</span>
        <span className="text-[10px] font-semibold tabular text-muted">
          {vehicles.length}
        </span>
      </div>
      <ul>
        {vehicles.map((v) => {
          const p = tripProgress(v, nowSec);
          return (
            <li key={v.tripId} className="px-4 py-2.5 hover:bg-surface/40 transition-colors">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: v.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <MapPin size={11} className="text-subtle shrink-0" />
                    <p className="text-xs font-medium text-fg truncate">
                      {v.nextStopName || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <ProgressBar value={p} color={v.color} />
                    <span className="text-[10px] text-muted tabular shrink-0">
                      {Math.round(p * 100)}%
                    </span>
                  </div>
                </div>
                <DelayBadge delay={v.delay} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex-1 h-1 rounded-full bg-border overflow-hidden">
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-linear"
        style={{
          width: `${Math.min(100, Math.max(0, value * 100))}%`,
          background: color,
        }}
      />
    </div>
  );
}

function DelayBadge({ delay }: { delay: number }) {
  if (!delay || Math.abs(delay) < 30) {
    return (
      <span className="text-[10px] font-medium px-1.5 h-5 rounded inline-flex items-center bg-success/15 text-success">
        ✓
      </span>
    );
  }
  const min = Math.round(delay / 60);
  const late = min > 0;
  return (
    <span
      className={cn(
        "text-[10px] font-bold tabular px-1.5 h-5 rounded inline-flex items-center",
        late ? "bg-danger/15 text-danger" : "bg-success/15 text-success"
      )}
    >
      {late ? "+" : ""}{min}′
    </span>
  );
}

function FreshnessDot({ lastUpdate, loading }: { lastUpdate: number | null; loading: boolean }) {
  // Init to 0 so the SSR snapshot is deterministic — the useEffect ticks it
  // to Date.now() on mount. (The component returns null while !lastUpdate
  // anyway, so this is defense-in-depth, not a fix for a live bug.)
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  if (!lastUpdate) return loading ? <Clock size={14} className="text-subtle animate-pulse" /> : null;
  const age = Math.round((now - lastUpdate) / 1000);
  return (
    <div className="flex items-center gap-1 text-[10px] text-muted tabular">
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          age < 14 ? "bg-success animate-pulse" : "bg-warning"
        )}
      />
      {age}s
    </div>
  );
}
