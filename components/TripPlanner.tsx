"use client";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { ArrowDown, ArrowRight, Bus, Footprints, Locate, Search, TrainFront, X } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { CO2Comparator } from "./CO2Comparator";

interface Place {
  name: string;
  lat: number;
  lon: number;
  meta?: string;
}

interface Leg {
  mode: string;
  startTime: number;
  endTime: number;
  duration: number;
  distance: number;
  from: { name: string; lat: number; lon: number; departure?: number };
  to: { name: string; lat: number; lon: number; arrival?: number };
  routeShortName?: string;
  routeColor?: string;
  routeTextColor?: string;
  headsign?: string;
  legGeometry?: { points: string };
  realTime?: boolean;
  intermediateStops?: Array<{ name: string; arrival?: number }>;
}

interface Itinerary {
  duration: number;
  startTime: number;
  endTime: number;
  walkTime: number;
  transitTime: number;
  walkDistance: number;
  transfers: number;
  legs: Leg[];
}

export function TripPlanner() {
  const { state, dispatch } = useApp();
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [itineraries, setItineraries] = useState<Itinerary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!state.tripOpen) return null;

  async function compute() {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const url = `/api/plan?from=${from.lat},${from.lon}&to=${to.lat},${to.lon}&mode=TRANSIT,WALK&n=4`;
      const res = await fetch(url);
      const data = await res.json();
      setItineraries(data?.plan?.itineraries ?? []);
    } catch {
      setError("Calcul impossible. Réessaye.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="absolute left-4 top-4 bottom-4 z-30 w-[420px] max-w-[calc(100vw-32px)] flex flex-col gap-3 animate-fade-up">
      <div className="rounded-2xl bg-elev shadow-pop border p-4">
        <header className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Itinéraire</h2>
          <button
            type="button"
            onClick={() => dispatch({ type: "TOGGLE_TRIP" })}
            className="rounded-md p-1.5 hover:bg-surface transition-colors"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </header>

        <div className="space-y-2 relative">
          <PlaceInput
            placeholder="Départ"
            value={from}
            onChange={setFrom}
            allowGeolocate
          />
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-border" />
            <ArrowDown size={14} className="text-subtle" />
            <div className="flex-1 h-px bg-border" />
          </div>
          <PlaceInput placeholder="Arrivée" value={to} onChange={setTo} />
        </div>

        <button
          type="button"
          onClick={compute}
          disabled={!from || !to || loading}
          className={cn(
            "mt-3 w-full h-11 rounded-xl font-semibold text-sm transition-all",
            from && to && !loading
              ? "bg-accent text-accent-fg hover:opacity-90 active:scale-[0.98]"
              : "bg-surface text-subtle cursor-not-allowed"
          )}
        >
          {loading ? "Calcul…" : "Rechercher"}
        </button>
        {error && <p className="text-xs text-danger mt-2">{error}</p>}
      </div>

      <div className="flex-1 rounded-2xl bg-elev shadow-soft border overflow-hidden flex flex-col">
        {loading ? (
          <div className="p-4 space-y-3">
            <div className="h-20 rounded-lg skeleton" />
            <div className="h-20 rounded-lg skeleton" />
          </div>
        ) : itineraries === null ? (
          <div className="p-8 text-center text-sm text-muted">
            Choisis un départ et une arrivée pour obtenir les meilleurs itinéraires.
          </div>
        ) : itineraries.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">
            Aucun itinéraire trouvé.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto scroll-area p-2 space-y-2">
            {itineraries.map((it, i) => (
              <ItineraryCard key={i} it={it} />
            ))}
            <CO2Comparator distanceKm={Math.max(0.1, computeDistanceKm(itineraries[0]))} />
          </div>
        )}
      </div>
    </aside>
  );
}

function computeDistanceKm(it: Itinerary): number {
  // sum transit leg distance + walk distance; fallback to straight-line
  let total = it.walkDistance || 0;
  for (const l of it.legs) {
    if (l.mode !== "WALK") total += l.distance || 0;
  }
  return total / 1000;
}

function ItineraryCard({ it }: { it: Itinerary }) {
  const minutes = Math.round(it.duration / 60);
  const depart = new Date(it.startTime);
  const arrive = new Date(it.endTime);
  const fmt = (d: Date) =>
    `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;

  return (
    <article className="p-3 rounded-xl border bg-elev hover:bg-surface/60 transition-colors">
      <div className="flex items-baseline justify-between gap-2 mb-2.5">
        <span className="text-base font-bold tabular">{minutes} min</span>
        <span className="text-xs text-muted tabular">
          {fmt(depart)} → {fmt(arrive)}
        </span>
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {it.legs.map((l, i) => (
          <LegBadge key={i} leg={l} last={i === it.legs.length - 1} />
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted tabular">
        <span>{Math.round(it.walkDistance)} m à pied</span>
        {it.transfers > 0 && <span>· {it.transfers} correspondance{it.transfers > 1 ? "s" : ""}</span>}
      </div>
    </article>
  );
}

function LegBadge({ leg, last }: { leg: Leg; last: boolean }) {
  const walk = leg.mode === "WALK";
  const isTram = leg.mode === "TRAM" || leg.mode === "SUBWAY";
  const min = Math.max(1, Math.round(leg.duration / 60));
  if (walk) {
    return (
      <>
        <span className="inline-flex items-center gap-1 px-2 h-7 rounded-md bg-surface border text-[11px] font-medium text-muted">
          <Footprints size={12} /> {min}′
        </span>
        {!last && <ArrowRight size={11} className="text-subtle" />}
      </>
    );
  }
  return (
    <>
      <span
        className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-bold"
        style={{
          background: leg.routeColor ? `#${leg.routeColor}` : "#222",
          color: leg.routeTextColor ? `#${leg.routeTextColor}` : "#fff",
        }}
      >
        {isTram ? <TrainFront size={12} /> : <Bus size={12} />}
        {leg.routeShortName || leg.mode}
      </span>
      {!last && <ArrowRight size={11} className="text-subtle" />}
    </>
  );
}

function PlaceInput({
  value,
  onChange,
  placeholder,
  allowGeolocate,
}: {
  value: Place | null;
  onChange: (p: Place | null) => void;
  placeholder: string;
  allowGeolocate?: boolean;
}) {
  const [q, setQ] = useState(value?.name ?? "");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const tRef = useRef<any>(null);

  useEffect(() => {
    if (value?.name && value.name !== q) setQ(value.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (q.trim().length < 2 || (value && q === value.name)) {
      setResults([]);
      return;
    }
    clearTimeout(tRef.current);
    tRef.current = setTimeout(async () => {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      const items: Place[] = (data.features || []).map((f: any) => ({
        name: (f.properties.LIBELLE || f.properties.name || "").split(";")[0],
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        meta: [f.properties.COMMUNE, f.properties.typeLieux].filter(Boolean).join(" · "),
      })).filter((p: Place) => p.name);
      setResults(items);
    }, 200);
  }, [q, value]);

  return (
    <div className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
        <input
          type="text"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); onChange(null); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="w-full h-11 pl-9 pr-9 rounded-xl bg-surface border-0 text-sm outline-none focus:ring-2 focus:ring-accent/40 transition"
        />
        {allowGeolocate && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-subtle hover:text-accent hover:bg-bg transition-colors"
            aria-label="Ma position"
            onClick={() => {
              navigator.geolocation?.getCurrentPosition(
                (pos) => {
                  const p: Place = { name: "Ma position", lat: pos.coords.latitude, lon: pos.coords.longitude };
                  onChange(p);
                  setQ(p.name);
                },
                () => {}
              );
            }}
          >
            <Locate size={14} />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-40 left-0 right-0 mt-1.5 bg-elev border rounded-xl shadow-pop max-h-64 overflow-y-auto scroll-area animate-fade-up">
          {results.map((p, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange(p); setQ(p.name); setOpen(false); }}
                className="w-full text-left px-3 py-2 hover:bg-surface transition-colors flex items-start gap-2"
              >
                <Search size={12} className="mt-1 text-subtle shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-fg truncate">{p.name}</p>
                  {p.meta && <p className="text-[11px] text-muted truncate">{p.meta}</p>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
