"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import type { StopTimePattern } from "@/lib/types";
import { cn, formatRelativeTime, nowSecondsSinceMidnight } from "@/lib/utils";
import { Locate, MapPin, X } from "lucide-react";

interface NearStop {
  id: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
  distanceM: number;
  lines: string[];
  linesData: { shortName: string; color: string }[];
}

function haversine(a: [number, number], b: [number, number]) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

export function NearMeFab() {
  const { state, dispatch } = useApp();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stops, setStops] = useState<NearStop[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const findNearest = async () => {
    setLoading(true);
    setErr(null);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error("geo unavailable"));
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
        });
      });
      const me: [number, number] = [pos.coords.longitude, pos.coords.latitude];
      const fc = await fetch("/api/all-stops").then((r) => r.json());
      const ranked = (fc.features as any[])
        .map((f) => {
          const c = f.geometry.coordinates as [number, number];
          const d = haversine(me, c);
          return {
            id: f.properties.id,
            name: f.properties.name,
            city: f.properties.city,
            lat: c[1],
            lon: c[0],
            distanceM: d,
            lines: (f.properties.lines || "").split(",").filter(Boolean),
            linesData: [] as any[],
          };
        })
        .sort((a, b) => a.distanceM - b.distanceM)
        .slice(0, 6) as NearStop[];

      // Enrich with line colors from routes
      const byShort = new Map(state.routes.map((r) => [r.shortName, r]));
      for (const s of ranked) {
        s.linesData = s.lines.map((ln) => {
          const r = byShort.get(ln);
          return r ? { shortName: r.shortName, color: r.color } : { shortName: ln, color: "777777" };
        });
      }
      setStops(ranked);
      setOpen(true);
    } catch (e: any) {
      setErr(e?.message === "geo unavailable" ? "Géolocalisation impossible" : "Refusé ou indisponible");
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  // Listen to programmatic trigger from CommandPalette
  useEffect(() => {
    const h = () => findNearest();
    window.addEventListener("m-near-me", h);
    return () => window.removeEventListener("m-near-me", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={findNearest}
        disabled={loading}
        className={cn(
          "absolute bottom-16 right-4 z-30 h-12 w-12 rounded-2xl glass-strong text-accent magnetic ripple inline-flex items-center justify-center group",
          loading && "animate-pulse"
        )}
        aria-label="Trouver les arrêts près de moi"
        title="Arrêts près de moi"
      >
        <Locate size={18} className="group-hover:rotate-12 transition-transform" />
      </button>

      {open && (
        <div className="absolute bottom-32 right-4 z-30 w-[360px] max-w-[calc(100vw-32px)] glass-strong rounded-2xl overflow-hidden animate-fade-up">
          <header className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="text-sm font-semibold">Près de moi</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 hover:bg-surface"
              aria-label="Fermer"
            >
              <X size={14} />
            </button>
          </header>
          {err ? (
            <div className="p-5 text-center text-sm text-muted">{err}</div>
          ) : stops.length === 0 ? (
            <div className="p-5 text-center text-sm text-muted">Aucun arrêt trouvé.</div>
          ) : (
            <ul className="max-h-[400px] overflow-y-auto scroll-area">
              {stops.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => { dispatch({ type: "SELECT_STOP", id: s.id }); setOpen(false); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-surface transition-colors flex items-center gap-3"
                  >
                    <span className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                      <MapPin size={14} className="text-accent" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold truncate">{s.name}</p>
                        <span className="text-[11px] text-muted tabular shrink-0">
                          {s.distanceM < 1000
                            ? `${Math.round(s.distanceM)} m`
                            : `${(s.distanceM / 1000).toFixed(1)} km`}
                        </span>
                      </div>
                      {s.city && <p className="text-[11px] text-muted truncate">{s.city}</p>}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {s.linesData.slice(0, 6).map((l, i) => (
                          <span
                            key={i}
                            className="text-[9px] font-bold px-1 h-4 rounded inline-flex items-center"
                            style={{ background: `#${l.color}`, color: "#fff" }}
                          >
                            {l.shortName}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
