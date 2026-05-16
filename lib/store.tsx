"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { Route } from "./types";

export type ModeFilter = "ALL" | "TRAM" | "BUS";
export type Theme = "light" | "dark";
export type Accent = "magenta" | "A" | "B" | "D" | "E";

export const ACCENT_VALUES: Record<Accent, { h: number; s: number; l: number; label: string }> = {
  magenta: { h: 332, s: 88, l: 46, label: "M réso" },
  A:       { h: 207, s: 56, l: 46, label: "Tram A — Bleu" },
  B:       { h: 119, s: 38, l: 44, label: "Tram B — Vert" },
  D:       { h: 38,  s: 92, l: 50, label: "Tram D — Jaune" },
  E:       { h: 268, s: 33, l: 47, label: "Tram E — Violet" },
};

export interface AppState {
  routes: Route[];
  selectedRouteId: string | null;
  selectedStopId: string | null;
  selectedVehicleTripId: string | null;
  followVehicle: boolean;
  modeFilter: ModeFilter;
  query: string;
  favorites: string[];     // route ids
  favStops: string[];      // stop gtfsIds
  showVehicles: boolean;
  showHeatmap: boolean;
  theme: Theme;
  accent: Accent;
  tripOpen: boolean;
}

type Action =
  | { type: "SET_ROUTES"; routes: Route[] }
  | { type: "SELECT_ROUTE"; id: string | null }
  | { type: "SELECT_STOP"; id: string | null }
  | { type: "SELECT_VEHICLE"; tripId: string | null }
  | { type: "TOGGLE_FOLLOW" }
  | { type: "SET_MODE"; mode: ModeFilter }
  | { type: "SET_QUERY"; query: string }
  | { type: "TOGGLE_FAV"; id: string }
  | { type: "SET_FAVS"; ids: string[] }
  | { type: "TOGGLE_FAV_STOP"; id: string }
  | { type: "SET_FAV_STOPS"; ids: string[] }
  | { type: "TOGGLE_VEHICLES" }
  | { type: "TOGGLE_HEATMAP" }
  | { type: "SET_THEME"; theme: Theme }
  | { type: "SET_ACCENT"; accent: Accent }
  | { type: "TOGGLE_TRIP" };

const initial: AppState = {
  routes: [],
  selectedRouteId: null,
  selectedStopId: null,
  selectedVehicleTripId: null,
  followVehicle: false,
  modeFilter: "ALL",
  query: "",
  favorites: [],
  favStops: [],
  showVehicles: true,
  showHeatmap: false,
  theme: "light",
  accent: "magenta",
  tripOpen: false,
};

function applyAccentToDom(a: Accent) {
  if (typeof document === "undefined") return;
  const v = ACCENT_VALUES[a];
  document.documentElement.style.setProperty("--accent", `${v.h} ${v.s}% ${v.l}%`);
  document.documentElement.style.setProperty(
    "--accent-2",
    `${v.h} ${Math.min(v.s + 4, 96)}% ${Math.min(v.l + 10, 70)}%`
  );
  document.documentElement.style.setProperty(
    "--accent-soft",
    `${v.h} ${Math.min(v.s + 4, 92)}% 96%`
  );
}

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case "SET_ROUTES": return { ...s, routes: a.routes };
    case "SELECT_ROUTE": return { ...s, selectedRouteId: a.id, selectedStopId: null };
    case "SELECT_STOP": return { ...s, selectedStopId: a.id };
    case "SET_MODE": return { ...s, modeFilter: a.mode };
    case "SET_QUERY": return { ...s, query: a.query };
    case "TOGGLE_FAV": {
      const has = s.favorites.includes(a.id);
      const favorites = has ? s.favorites.filter((x) => x !== a.id) : [...s.favorites, a.id];
      if (typeof window !== "undefined") localStorage.setItem("m-favs", JSON.stringify(favorites));
      return { ...s, favorites };
    }
    case "SET_FAVS": return { ...s, favorites: a.ids };
    case "TOGGLE_FAV_STOP": {
      const has = s.favStops.includes(a.id);
      const favStops = has ? s.favStops.filter((x) => x !== a.id) : [...s.favStops, a.id];
      if (typeof window !== "undefined") localStorage.setItem("m-fav-stops", JSON.stringify(favStops));
      return { ...s, favStops };
    }
    case "SET_FAV_STOPS": return { ...s, favStops: a.ids };
    case "SELECT_VEHICLE": return { ...s, selectedVehicleTripId: a.tripId, followVehicle: a.tripId ? s.followVehicle : false };
    case "TOGGLE_FOLLOW": return { ...s, followVehicle: !s.followVehicle };
    case "TOGGLE_VEHICLES": return { ...s, showVehicles: !s.showVehicles };
    case "TOGGLE_HEATMAP": return { ...s, showHeatmap: !s.showHeatmap };
    case "SET_THEME": {
      if (typeof document !== "undefined") {
        document.documentElement.dataset.theme = a.theme;
        localStorage.setItem("m-theme", a.theme);
      }
      return { ...s, theme: a.theme };
    }
    case "SET_ACCENT": {
      applyAccentToDom(a.accent);
      if (typeof window !== "undefined") localStorage.setItem("m-accent", a.accent);
      return { ...s, accent: a.accent };
    }
    case "TOGGLE_TRIP": return { ...s, tripOpen: !s.tripOpen };
    default: return s;
  }
}

const Ctx = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);

  useEffect(() => {
    fetch("/api/routes").then((r) => r.json()).then((routes: Route[]) => {
      dispatch({ type: "SET_ROUTES", routes });
    });
    try {
      const raw = localStorage.getItem("m-favs");
      if (raw) dispatch({ type: "SET_FAVS", ids: JSON.parse(raw) });
      const rawStops = localStorage.getItem("m-fav-stops");
      if (rawStops) dispatch({ type: "SET_FAV_STOPS", ids: JSON.parse(rawStops) });
      const t = localStorage.getItem("m-theme") as Theme | null;
      const prefDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
      dispatch({ type: "SET_THEME", theme: t ?? (prefDark ? "dark" : "light") });
      const a = localStorage.getItem("m-accent") as Accent | null;
      if (a && a in ACCENT_VALUES) dispatch({ type: "SET_ACCENT", accent: a });
    } catch {}
  }, []);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used within AppProvider");
  return v;
}
