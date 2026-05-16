"use client";
import { useEffect, useMemo, useState } from "react";
import { useApp, type ModeFilter } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { LinePill } from "./LinePill";
import { Bus, TrainFront, Search, Star, ArrowLeft, MapPin, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Stop } from "@/lib/types";
import { FavStopsSection } from "./FavStopsSection";

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  return mobile;
}

export function Sidebar() {
  const { state } = useApp();
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (state.tripOpen) return null; // trip planner takes over the sidebar slot

  if (isMobile) {
    return (
      <div
        className="mobile-sheet"
        data-open={sheetOpen ? "true" : "false"}
        onClick={() => !sheetOpen && setSheetOpen(true)}
      >
        <button
          type="button"
          className="mobile-sheet-handle"
          onClick={(e) => { e.stopPropagation(); setSheetOpen((v) => !v); }}
          aria-label={sheetOpen ? "Réduire" : "Agrandir"}
        />
        <div className="px-3 pb-3 flex flex-col gap-3 overflow-hidden flex-1">
          {state.selectedRouteId ? <RouteDetailInner /> : (
            <>
              <Header />
              <Filters />
              <RouteList />
            </>
          )}
        </div>
      </div>
    );
  }

  if (state.selectedRouteId) return <RouteDetail />;

  return (
    <aside className="absolute left-4 top-4 bottom-4 z-20 w-[420px] max-w-[calc(100vw-32px)] flex flex-col gap-3 animate-fade-up">
      <Header />
      <Filters />
      <FavStopsSection />
      <RouteList />
    </aside>
  );
}

function Header() {
  return (
    <div className="glass rounded-2xl px-4 py-3.5 flex items-center gap-3 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-20 blur-2xl pointer-events-none"
        style={{ background: "radial-gradient(circle, hsl(var(--accent)) 0%, transparent 70%)" }}
      />
      <img
        src="/icon-192.png"
        alt="M réso"
        width={44}
        height={44}
        className="relative w-11 h-11 shrink-0 drop-shadow-[0_4px_10px_rgba(0,0,0,0.18)]"
      />
      <div className="flex-1 min-w-0 relative">
        <h1 className="text-title text-fg leading-tight">M temps réel</h1>
        <p className="text-caption mt-0.5">Tram & bus · Métropole grenobloise</p>
      </div>
      <span className="relative text-overline text-success flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-success heartbeat" />
        Live
      </span>
    </div>
  );
}

function Filters() {
  const { state, dispatch } = useApp();
  const Btn = ({ mode, label, icon: Icon }: { mode: ModeFilter; label: string; icon: any }) => (
    <button
      type="button"
      onClick={() => dispatch({ type: "SET_MODE", mode })}
      className={cn(
        "relative flex-1 h-9 rounded-lg text-body font-medium inline-flex items-center justify-center gap-1.5 btn-press transition-all",
        state.modeFilter === mode
          ? "bg-elev text-fg elev-2"
          : "text-muted hover:text-fg"
      )}
    >
      <Icon size={14} /> {label}
    </button>
  );
  return (
    <div className="glass rounded-2xl p-3 space-y-3">
      <SearchBar />
      <div className="flex items-center gap-1 p-1 rounded-xl bg-surface/60">
        <Btn mode="ALL" label="Tout" icon={Radio} />
        <Btn mode="TRAM" label="Tram" icon={TrainFront} />
        <Btn mode="BUS" label="Bus" icon={Bus} />
      </div>
      <label className="flex items-center justify-between text-body">
        <span className="text-muted">Véhicules temps réel</span>
        <button
          type="button"
          onClick={() => dispatch({ type: "TOGGLE_VEHICLES" })}
          className={cn(
            "relative w-10 h-5.5 rounded-full transition-colors btn-press",
            state.showVehicles ? "bg-accent" : "bg-border-strong"
          )}
          aria-pressed={state.showVehicles ? "true" : "false"}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full elev-1 transition-transform duration-200",
              state.showVehicles && "translate-x-[18px]"
            )}
          />
        </button>
      </label>
    </div>
  );
}

function SearchBar() {
  const { state, dispatch } = useApp();
  return (
    <div className="relative group">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle group-focus-within:text-accent transition-colors" />
      <input
        type="text"
        value={state.query}
        onChange={(e) => dispatch({ type: "SET_QUERY", query: e.target.value })}
        placeholder="Rechercher une ligne…"
        className="w-full h-10 pl-9 pr-12 rounded-xl bg-surface/70 border border-transparent text-body text-fg placeholder:text-subtle outline-none focus:bg-elev focus:border-accent/40 focus:ring-4 focus:ring-accent/10 transition-all"
      />
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-0.5">
        <kbd>⌘</kbd><kbd>K</kbd>
      </span>
    </div>
  );
}

function RouteList() {
  const { state, dispatch } = useApp();
  const filtered = useMemo(() => {
    const q = state.query.trim().toLowerCase();
    return state.routes
      .filter((r) => state.modeFilter === "ALL" || r.mode === state.modeFilter)
      .filter((r) =>
        !q ||
        r.shortName.toLowerCase().includes(q) ||
        r.longName.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        // TRAM first, then alpha-num
        if (a.mode !== b.mode) return a.mode === "TRAM" ? -1 : 1;
        const an = parseInt(a.shortName, 10);
        const bn = parseInt(b.shortName, 10);
        if (!isNaN(an) && !isNaN(bn)) return an - bn;
        return a.shortName.localeCompare(b.shortName);
      });
  }, [state.routes, state.query, state.modeFilter]);

  const favs = filtered.filter((r) => state.favorites.includes(r.id));
  const rest = filtered.filter((r) => !state.favorites.includes(r.id));

  return (
    <div className="flex-1 glass rounded-2xl overflow-hidden flex flex-col">
      <div className="px-4 py-2.5 border-b flex items-center justify-between">
        <span className="text-overline">
          {filtered.length} {filtered.length > 1 ? "lignes" : "ligne"}
        </span>
        <span className="text-caption text-subtle">
          Cliquer pour ouvrir
        </span>
      </div>
      <div className="flex-1 overflow-y-auto scroll-area">
        {favs.length > 0 && <Section title="Favoris" items={favs} />}
        <Section title={favs.length ? "Toutes les lignes" : null} items={rest} />
        {filtered.length === 0 && <EmptyResults query={query => dispatch({ type: "SET_QUERY", query })} />}
      </div>
    </div>
  );
}

function EmptyResults({ query }: { query: (q: string) => void }) {
  return (
    <div className="p-8 text-center">
      <div className="w-12 h-12 mx-auto rounded-full bg-surface flex items-center justify-center mb-3">
        <Search size={18} className="text-subtle" />
      </div>
      <p className="text-headline text-fg">Aucune ligne ne correspond</p>
      <p className="text-caption mt-1">Essaie un autre terme ou retire les filtres.</p>
      <button
        type="button"
        onClick={() => query("")}
        className="mt-3 text-caption text-accent hover:underline"
      >
        Réinitialiser la recherche
      </button>
    </div>
  );
}

function Section({ title, items }: { title: string | null; items: any[] }) {
  const { state, dispatch } = useApp();
  const toast = useToast();
  return (
    <>
      {title && (
        <div className="px-4 pt-3 pb-1.5 flex items-center justify-between">
          <span className="text-overline">{title}</span>
          <span className="text-caption text-subtle tabular">{items.length}</span>
        </div>
      )}
      <ul className="p-1.5 stagger">
        {items.map((r, i) => (
          <li
            key={r.id}
            className="group relative animate-fade-up"
            style={{ ["--i" as any]: i }}
          >
            <button
              type="button"
              onClick={() => dispatch({ type: "SELECT_ROUTE", id: r.id })}
              className="w-full flex items-center gap-3 p-2.5 pr-10 rounded-lg hover:bg-surface transition-colors text-left btn-press"
            >
              <LinePill route={r} />
              <div className="flex-1 min-w-0">
                <p className="text-headline text-fg truncate">{r.longName}</p>
                <p className="text-caption truncate">
                  {r.mode === "TRAM" ? "Tramway" : r.type === "CHRONO" ? "Chrono" : r.type === "PROXIMO" ? "Proximo" : r.type === "FLEXO" ? "Flexo" : "Bus"}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                const was = state.favorites.includes(r.id);
                dispatch({ type: "TOGGLE_FAV", id: r.id });
                toast.push({
                  kind: was ? "info" : "success",
                  title: was ? `Ligne ${r.shortName} retirée des favoris` : `Ligne ${r.shortName} ajoutée aux favoris`,
                });
              }}
              className={cn(
                "absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-all",
                state.favorites.includes(r.id)
                  ? "text-warning opacity-100"
                  : "text-subtle opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-warning hover:scale-110"
              )}
              aria-label={state.favorites.includes(r.id) ? "Retirer des favoris" : "Ajouter aux favoris"}
            >
              <Star size={14} fill={state.favorites.includes(r.id) ? "currentColor" : "none"} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function RouteDetailInner() {
  const { state, dispatch } = useApp();
  const [stops, setStops] = useState<Stop[]>([]);
  const route = state.routes.find((r) => r.id === state.selectedRouteId);

  useEffect(() => {
    if (!state.selectedRouteId) return;
    fetch(`/api/stops/${state.selectedRouteId}`).then((r) => r.json()).then(setStops);
  }, [state.selectedRouteId]);

  if (!route) return null;

  const dedup: Stop[] = [];
  for (const s of stops) {
    if (!dedup.find((x) => x.name === s.name)) dedup.push(s);
  }
  const isFav = state.favorites.includes(route.id);

  return (
    <>
      <div className="rounded-2xl bg-elev shadow-soft border p-4 flex items-center gap-3">
        <button
          onClick={() => dispatch({ type: "SELECT_ROUTE", id: null })}
          className="rounded-lg p-1.5 hover:bg-surface transition-colors"
          aria-label="Retour"
        >
          <ArrowLeft size={16} />
        </button>
        <LinePill route={route} size="lg" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
            {route.mode === "TRAM" ? "Tramway" : route.type}
          </p>
          <h2 className="text-sm font-semibold leading-tight truncate">{route.longName}</h2>
        </div>
        <button
          onClick={() => dispatch({ type: "TOGGLE_FAV", id: route.id })}
          className={cn(
            "rounded-lg p-2 transition-colors",
            isFav ? "text-warning bg-warning/10" : "text-subtle hover:bg-surface"
          )}
          aria-label="Favori"
        >
          <Star size={16} fill={isFav ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="flex-1 rounded-2xl bg-elev shadow-soft border overflow-hidden flex flex-col">
        <div className="px-4 py-2.5 border-b flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            {dedup.length} arrêts
          </span>
          <span className="text-[11px] text-muted">Cliquer pour les horaires</span>
        </div>
        <ul className="flex-1 overflow-y-auto scroll-area p-2">
          {dedup.map((s, i) => (
            <li key={s.gtfsId}>
              <button
                onClick={() => dispatch({ type: "SELECT_STOP", id: s.gtfsId })}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                  state.selectedStopId === s.gtfsId
                    ? "bg-accent/10"
                    : "hover:bg-surface"
                )}
              >
                <div className="relative w-5 flex justify-center">
                  {i > 0 && <span className="absolute top-0 bottom-1/2 w-0.5" style={{ background: `#${route.color}` }} />}
                  {i < dedup.length - 1 && <span className="absolute top-1/2 bottom-0 w-0.5" style={{ background: `#${route.color}` }} />}
                  <span
                    className="relative w-3 h-3 rounded-full bg-white"
                    style={{ boxShadow: `0 0 0 2px #${route.color}` }}
                  />
                </div>
                <span className="flex-1 text-sm text-fg truncate">{s.name}</span>
                {state.selectedStopId === s.gtfsId && <MapPin size={14} className="text-accent" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function RouteDetail() {
  return (
    <aside className="absolute left-4 top-4 bottom-4 z-20 w-[420px] max-w-[calc(100vw-32px)] flex flex-col gap-3 animate-fade-up">
      <RouteDetailInner />
    </aside>
  );
}
