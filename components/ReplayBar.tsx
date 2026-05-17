"use client";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { Play, Pause, Rewind, FastForward, X, History } from "lucide-react";
import type { Vehicle } from "@/lib/types";
import maplibregl from "maplibre-gl";
import { cn, readableOn, nowSecondsSinceMidnight } from "@/lib/utils";

/**
 * Time-travel scrubber: lets the user replay vehicle positions for the selected
 * route (or all trams) over the past N hours of today.
 */
export function ReplayBar() {
  const { state } = useApp();
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [sec, setSec] = useState(() => nowSecondsSinceMidnight());
  const [speed, setSpeed] = useState(60); // 1 minute of replay per real second
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  // open via custom event from CommandPalette / keyboard
  useEffect(() => {
    const onTrigger = () => setOpen((o) => !o);
    window.addEventListener("m-replay-toggle", onTrigger);
    return () => window.removeEventListener("m-replay-toggle", onTrigger);
  }, []);

  // play loop
  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => {
      setSec((s) => {
        const next = s + speed / 4; // 4 ticks per second for smoothness
        const n = nowSecondsSinceMidnight();
        return next > n ? n : next;
      });
    }, 250);
    return () => clearInterval(iv);
  }, [playing, speed]);

  // fetch vehicle positions whenever sec changes (debounced)
  useEffect(() => {
    if (!open) return;
    const map: any = (window as any).__mMap;
    if (!map) return;
    const targets = state.selectedRouteId
      ? state.routes.filter((r) => r.id === state.selectedRouteId)
      : state.routes.filter((r) => r.mode === "TRAM");
    let cancel = false;

    const t = setTimeout(async () => {
      const results = await Promise.allSettled(
        targets.map((r) =>
          fetch(`/api/replay/${r.id}?at=${Math.round(sec)}`).then((x) => x.json())
        )
      );
      const all: Vehicle[] = [];
      for (const r of results) {
        if (r.status === "fulfilled" && r.value?.vehicles) all.push(...r.value.vehicles);
      }
      if (cancel) return;
      const seen = new Set<string>();
      for (const v of all) {
        seen.add(v.tripId);
        const m = markersRef.current.get(v.tripId);
        if (m) {
          m.setLngLat([v.lon, v.lat]);
        } else {
          const root = document.createElement("div");
          root.style.cssText = "opacity:0.85;will-change:transform;";
          root.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;background:${v.color};color:${readableOn(v.color)};font:700 9px/1 var(--font-sans);box-shadow:0 0 0 2px #fff,0 2px 4px rgba(0,0,0,.2);">
              ${v.shortName}
            </div>`;
          const mk = new maplibregl.Marker({ element: root, anchor: "center" })
            .setLngLat([v.lon, v.lat])
            .addTo(map);
          markersRef.current.set(v.tripId, mk);
        }
      }
      for (const [id, mk] of markersRef.current) {
        if (!seen.has(id)) { mk.remove(); markersRef.current.delete(id); }
      }
    }, 220);

    return () => { cancel = true; clearTimeout(t); };
  }, [sec, state.selectedRouteId, state.routes, open]);

  // Cleanup markers on close
  useEffect(() => {
    if (open) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();
    setPlaying(false);
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute bottom-16 right-20 z-30 h-12 px-3 rounded-2xl glass-strong inline-flex items-center gap-2 text-body magnetic ripple"
        aria-label="Mode replay"
      >
        <History size={14} className="text-accent" />
        <span className="hidden sm:inline">Replay</span>
      </button>
    );
  }

  const now = nowSecondsSinceMidnight();
  const start = Math.max(0, now - 3600 * 3); // 3 h back max
  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-16 z-30 w-[min(640px,calc(100vw-32px))] animate-fade-up">
      <div className="glass-strong rounded-2xl p-3.5 flex flex-col gap-3">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History size={14} className="text-accent" />
            <span className="text-headline">Replay</span>
            <span className="text-overline tabular">{formatHHMM(sec)}</span>
            {sec < now - 5 && (
              <span className="text-[10px] text-muted">il y a {Math.round((now - sec) / 60)} min</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md p-1 hover:bg-surface transition-colors"
            aria-label="Fermer"
          >
            <X size={14} />
          </button>
        </header>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSec((s) => Math.max(start, s - 60))}
            className="h-9 w-9 rounded-lg bg-surface hover:bg-border transition-colors flex items-center justify-center btn-press"
            aria-label="−1 min"
          >
            <Rewind size={14} />
          </button>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="h-10 px-3 rounded-lg bg-accent text-accent-fg btn-press ripple inline-flex items-center gap-1.5 font-medium"
          >
            {playing ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Play</>}
          </button>
          <button
            type="button"
            onClick={() => setSec((s) => Math.min(now, s + 60))}
            className="h-9 w-9 rounded-lg bg-surface hover:bg-border transition-colors flex items-center justify-center btn-press"
            aria-label="+1 min"
          >
            <FastForward size={14} />
          </button>
          <input
            type="range"
            min={start}
            max={now}
            step={1}
            value={sec}
            onChange={(e) => { setPlaying(false); setSec(parseInt(e.target.value, 10)); }}
            className="flex-1 accent-accent h-2"
          />
          <select
            value={speed}
            onChange={(e) => setSpeed(parseInt(e.target.value, 10))}
            className="h-9 rounded-lg bg-surface text-body px-2 border border-border"
            aria-label="Vitesse"
          >
            <option value={30}>×30</option>
            <option value={60}>×60</option>
            <option value={120}>×120</option>
            <option value={300}>×300</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function formatHHMM(s: number) {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s - h * 3600) / 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}
