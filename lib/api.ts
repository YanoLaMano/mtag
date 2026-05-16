/**
 * Server-side proxy helpers for data.mobilites-m.fr.
 * The upstream requires an Origin header on some endpoints.
 */
import type { Route, Stop, StopTimePattern, LineGeometry } from "./types";

const BASE = "https://data.mobilites-m.fr";
const ORIGIN = "https://m-realtime.app";

export async function upstream<T = unknown>(
  path: string,
  init?: RequestInit & { revalidate?: number }
): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { Origin: ORIGIN, "Accept-Language": "fr", ...(init?.headers || {}) },
    next: { revalidate: init?.revalidate ?? 60 },
  });
  if (!res.ok) {
    throw new Error(`Upstream ${res.status}: ${url}`);
  }
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("json") ? res.json() : res.text()) as Promise<T>;
}

const ROUTE_ID_RE = /^[A-Z]{3,4}:[A-Z0-9_-]+$/;

export type VehiclesSnapshot = {
  route: Route;
  stops: Stop[];
  geometry: LineGeometry | null;
};

/**
 * Fetch route metadata + stops + geometry. Throws on invalid routeId,
 * returns null when the route is unknown upstream.
 */
export async function fetchVehiclesSnapshot(
  routeId: string
): Promise<VehiclesSnapshot | null> {
  if (!ROUTE_ID_RE.test(routeId)) throw new Error("Invalid routeId");

  const [routes, stops, geometry] = await Promise.all([
    upstream<Route[]>("/api/routers/default/index/routes", { revalidate: 3600 }),
    upstream<Stop[]>(
      `/api/routers/default/index/routes/${encodeURIComponent(routeId)}/stops`,
      { revalidate: 3600 }
    ),
    upstream<LineGeometry>(
      `/api/lines/json?types=ligne&codes=${encodeURIComponent(routeId.replace(":", "_"))}`,
      { revalidate: 86400 }
    ).catch(() => null),
  ]);

  const route = routes.find((r) => r.id === routeId);
  if (!route) return null;

  const uniqStops: Stop[] = Array.from(
    new Map(stops.map((s) => [s.gtfsId, s])).values()
  );

  return { route, stops: uniqStops, geometry: (geometry as LineGeometry | null) ?? null };
}

/**
 * Fetch stoptime patterns for every stop on the route in parallel.
 * Returns a {stopId: patterns[]} map, filtered to the requested route.
 */
export async function fetchVehiclePatterns(
  routeId: string,
  uniqStops: Stop[],
  revalidate: number
): Promise<Record<string, StopTimePattern[]>> {
  const results = await Promise.allSettled(
    uniqStops.map((s) =>
      upstream<StopTimePattern[]>(
        `/api/routers/default/index/stops/${encodeURIComponent(s.gtfsId)}/stoptimes`,
        { revalidate }
      ).then((d) => [s.gtfsId, d] as const)
    )
  );

  const patternsByStop: Record<string, StopTimePattern[]> = {};
  for (const r of results) {
    if (r.status === "fulfilled") {
      const [stopId, data] = r.value;
      const filtered = data.filter((p) => p.pattern.id.startsWith(`${routeId}:`));
      if (filtered.length) patternsByStop[stopId] = filtered;
    }
  }
  return patternsByStop;
}
