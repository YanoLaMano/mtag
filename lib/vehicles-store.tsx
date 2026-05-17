"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Vehicle } from "./types";

/**
 * Single-flight vehicles subscription store.
 *
 * Before this existed, five components (Map vehicle layer, LiveVehiclesPanel,
 * VehicleDetailPanel, StatusBar, FavStopArrivalParticles) each ran their own
 * `setInterval` + `fetch('/api/vehicles/<routeId>')`. When the user opened the
 * detail panel for a route already shown on the map, the same route id was
 * being polled 3–4× per cycle. This store collapses all consumers of a given
 * routeId onto a single 8 s poller; the first subscriber starts polling, the
 * last unsubscriber stops it.
 *
 * Snapshots are plain object refs; we mutate the entry in place and notify
 * subscribers. `useSyncExternalStore` handles tearing — the snapshot returned
 * from `getSnapshot` is the same reference until vehicles changes, so React
 * can bail out on equal renders. `useVehiclesForRoutes` uses a force-update
 * pattern instead because it needs to subscribe to a variable-length set of
 * route ids.
 */
interface RouteSnapshot {
  vehicles: Vehicle[];
  lastUpdate: number | null;
}

interface RouteState {
  subscribers: Set<() => void>;
  snapshot: RouteSnapshot;
  inFlight: boolean;
  gen: number;
  interval: ReturnType<typeof setInterval> | null;
}

const EMPTY: RouteSnapshot = { vehicles: [], lastUpdate: null };

class VehiclesStore {
  private routes = new Map<string, RouteState>();
  private readonly TICK_MS = 8_000;

  subscribe(routeId: string, cb: () => void): () => void {
    let entry = this.routes.get(routeId);
    if (!entry) {
      entry = {
        subscribers: new Set(),
        snapshot: EMPTY,
        inFlight: false,
        gen: 0,
        interval: null,
      };
      this.routes.set(routeId, entry);
    }
    entry.subscribers.add(cb);
    this.ensurePolling(routeId);
    return () => {
      const e = this.routes.get(routeId);
      if (!e) return;
      e.subscribers.delete(cb);
      if (e.subscribers.size === 0) {
        if (e.interval) clearInterval(e.interval);
        this.routes.delete(routeId);
      }
    };
  }

  getSnapshot(routeId: string): RouteSnapshot {
    const e = this.routes.get(routeId);
    return e ? e.snapshot : EMPTY;
  }

  private async tick(routeId: string) {
    const e = this.routes.get(routeId);
    if (!e || e.inFlight) return;
    e.inFlight = true;
    const mygen = ++e.gen;
    try {
      const res = await fetch(`/api/vehicles/${routeId}`);
      const data = await res.json();
      const current = this.routes.get(routeId);
      if (!current || mygen !== current.gen) return; // stale or unsubscribed
      current.snapshot = {
        vehicles: data.vehicles ?? [],
        lastUpdate: Date.now(),
      };
      for (const cb of current.subscribers) cb();
    } catch {
      /* tolerate transient network errors — next tick will retry */
    } finally {
      const e2 = this.routes.get(routeId);
      if (e2) e2.inFlight = false;
    }
  }

  private ensurePolling(routeId: string) {
    const e = this.routes.get(routeId);
    if (!e || e.interval) return;
    void this.tick(routeId);
    e.interval = setInterval(() => this.tick(routeId), this.TICK_MS);
  }
}

const StoreCtx = createContext<VehiclesStore | null>(null);

export function VehiclesProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<VehiclesStore | null>(null);
  if (!storeRef.current) storeRef.current = new VehiclesStore();
  return <StoreCtx.Provider value={storeRef.current}>{children}</StoreCtx.Provider>;
}

function useStore(): VehiclesStore {
  const s = useContext(StoreCtx);
  if (!s) throw new Error("VehiclesProvider missing");
  return s;
}

/** Subscribe to a single route. Pass null to opt out (returns EMPTY). */
export function useVehiclesForRoute(routeId: string | null): RouteSnapshot {
  const store = useStore();
  return useSyncExternalStore(
    (cb) => (routeId ? store.subscribe(routeId, cb) : () => {}),
    () => (routeId ? store.getSnapshot(routeId) : EMPTY),
    () => EMPTY
  );
}

export interface MultiRouteSnapshot {
  byRoute: Record<string, RouteSnapshot>;
  /** Merged list across every subscribed route. */
  all: Vehicle[];
  /** Most-recent lastUpdate across the set, or null if nothing has loaded yet. */
  lastUpdate: number | null;
}

/**
 * Subscribe to multiple routes. Re-subscribes only when the set of ids
 * changes (compared by sorted-join, not array identity).
 */
export function useVehiclesForRoutes(routeIds: string[]): MultiRouteSnapshot {
  const store = useStore();
  const [, force] = useState(0);
  const key = [...routeIds].sort().join(",");
  useEffect(() => {
    const cb = () => force((n) => n + 1);
    const ids = key ? key.split(",") : [];
    const unsubs = ids.map((id) => store.subscribe(id, cb));
    return () => {
      for (const u of unsubs) u();
    };
  }, [key, store]);

  const byRoute: Record<string, RouteSnapshot> = {};
  const all: Vehicle[] = [];
  let lastUpdate: number | null = null;
  for (const id of routeIds) {
    const snap = store.getSnapshot(id);
    byRoute[id] = snap;
    if (snap.vehicles.length) all.push(...snap.vehicles);
    if (snap.lastUpdate && (!lastUpdate || snap.lastUpdate > lastUpdate)) {
      lastUpdate = snap.lastUpdate;
    }
  }
  return { byRoute, all, lastUpdate };
}
