"use client";
import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import { useApp } from "@/lib/store";
import { useVehiclesForRoutes } from "@/lib/vehicles-store";

/**
 * Listens to vehicles of currently visible routes, detects when one ARRIVES
 * at a stop that is in the user's favorites, and emits a brief 3-dot particle
 * burst on the map at the stop's location.
 *
 * The component does not render its own map markers — it queries the global
 * map instance via window-attached ref (set by <MapView/>).
 */
export function FavStopArrivalParticles() {
  const { state } = useApp();
  const seenRef = useRef<Set<string>>(new Set()); // tripId+stopId already animated

  // Same target heuristic as the old code: when a route is selected, watch
  // only that one; otherwise watch every tram line. No-op when no favorites.
  const targetIds = useMemo<string[]>(() => {
    if (state.favStops.length === 0) return [];
    const targets = state.selectedRouteId
      ? state.routes.filter((r) => r.id === state.selectedRouteId)
      : state.routes.filter((r) => r.mode === "TRAM");
    return targets.map((r) => r.id);
  }, [state.favStops.length, state.routes, state.selectedRouteId]);

  const { all, lastUpdate } = useVehiclesForRoutes(targetIds);

  useEffect(() => {
    if (lastUpdate == null || state.favStops.length === 0) return;
    for (const v of all) {
      if (!v.atStopId || !state.favStops.includes(v.atStopId)) continue;
      const key = `${v.tripId}|${v.atStopId}`;
      if (seenRef.current.has(key)) continue;
      seenRef.current.add(key);
      // Prune set when too big
      if (seenRef.current.size > 200) {
        seenRef.current = new Set(Array.from(seenRef.current).slice(-100));
      }
      emitBurst(v.lon, v.lat, v.color);
    }
    // Run once per snapshot; `all` array identity changes every render so we
    // key on lastUpdate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastUpdate]);

  return null;
}

function emitBurst(lon: number, lat: number, color: string) {
  const map: any = (window as any).__mMap;
  if (!map) return;
  // Convert lng/lat to screen pixels
  const p = map.project([lon, lat]);
  const container = map.getContainer() as HTMLElement;
  for (let i = 0; i < 3; i++) {
    const el = document.createElement("div");
    el.className = "fav-particle";
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    el.style.background = color;
    const angle = (Math.PI * 2 * i) / 3 + Math.random() * 0.4 - 0.2;
    const distance = 28 + Math.random() * 10;
    el.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    el.style.setProperty("--dy", `${Math.sin(angle) * distance - 20}px`);
    el.style.setProperty("--delay", `${i * 60}ms`);
    container.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }
}
