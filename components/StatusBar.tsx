"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { Activity, TrainFront, Bus, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "./AnimatedNumber";

export function StatusBar() {
  const { state } = useApp();
  const [tramCount, setTramCount] = useState<number | null>(null);
  const [busCount, setBusCount] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    if (state.routes.length === 0) return;
    let cancel = false;
    const refresh = async () => {
      // Sample a few high-frequency lines for global counter
      const trams = state.routes.filter((r) => r.mode === "TRAM");
      const sampleBuses = state.routes.filter((r) => r.mode === "BUS" && r.type === "CHRONO").slice(0, 6);
      const targets = [...trams, ...sampleBuses];
      const results = await Promise.allSettled(
        targets.map((r) => fetch(`/api/vehicles/${r.id}`).then((x) => x.json()))
      );
      let t = 0, b = 0;
      for (const [i, res] of results.entries()) {
        if (res.status !== "fulfilled" || !res.value?.vehicles) continue;
        const n = res.value.vehicles.length;
        if (targets[i].mode === "TRAM") t += n; else b += n;
      }
      if (!cancel) {
        setTramCount(t);
        setBusCount(b);
        setLastUpdate(Date.now());
      }
    };
    refresh();
    const iv = setInterval(refresh, 30_000);
    return () => { cancel = true; clearInterval(iv); };
  }, [state.routes]);

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
