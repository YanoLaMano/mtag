"use client";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { Activity, TrainFront, Bus, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVehiclesForRoutes } from "@/lib/vehicles-store";
import { AnimatedNumber } from "./AnimatedNumber";

export function StatusBar() {
  const { state } = useApp();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // Same sampling as before: every tram + the first 6 CHRONO buses.
  const targets = useMemo(() => {
    const trams = state.routes.filter((r) => r.mode === "TRAM");
    const sampleBuses = state.routes.filter((r) => r.mode === "BUS" && r.type === "CHRONO").slice(0, 6);
    return [...trams, ...sampleBuses];
  }, [state.routes]);
  const targetIds = useMemo(() => targets.map((r) => r.id), [targets]);
  const { byRoute, lastUpdate } = useVehiclesForRoutes(targetIds);

  let tramCount: number | null = null;
  let busCount: number | null = null;
  if (lastUpdate != null) {
    let t = 0, b = 0;
    for (const r of targets) {
      const snap = byRoute[r.id];
      if (!snap || snap.lastUpdate == null) continue;
      const n = snap.vehicles.length;
      if (r.mode === "TRAM") t += n; else b += n;
    }
    tramCount = t;
    busCount = b;
  }

  const [age, setAge] = useState(0);
  useEffect(() => {
    if (!lastUpdate) return;
    const iv = setInterval(() => setAge(Math.round((Date.now() - lastUpdate) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [lastUpdate]);

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
      <div className="glass rounded-full px-3 py-1.5 inline-flex items-center gap-3 pointer-events-auto">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              online ? (age < 60 ? "bg-success heartbeat" : "bg-warning") : "bg-danger"
            )}
          />
          <span className="text-caption text-fg">
            {online ? (lastUpdate ? `Live · ${age}s` : "Connexion…") : "Hors-ligne"}
          </span>
        </div>
        <span className="w-px h-3 bg-border" />
        <div className="flex items-center gap-1 text-caption tabular">
          <TrainFront size={11} />
          <AnimatedNumber value={tramCount} className="font-semibold text-fg" />
        </div>
        <div className="flex items-center gap-1 text-caption tabular">
          <Bus size={11} />
          <AnimatedNumber value={busCount} className="font-semibold text-fg" />
        </div>
        <span className="w-px h-3 bg-border" />
        <span className="text-caption text-subtle">M Open Data</span>
      </div>
    </div>
  );
}
