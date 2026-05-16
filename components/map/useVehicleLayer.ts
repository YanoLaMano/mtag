"use client";
import { useEffect, useRef, RefObject } from "react";
import maplibregl, { Map as MLMap } from "maplibre-gl";
import type { Vehicle, Route } from "@/lib/types";
import { readableOn } from "@/lib/utils";
import { Anim, interpLat, interpLon, interpBearing } from "./anim";
import type { AppState, AppDispatch } from "./types";

export function useVehicleLayer(params: {
  mapRef: RefObject<MLMap | null>;
  state: AppState;
  dispatch: AppDispatch;
  ready: boolean;
}) {
  const { mapRef, state, dispatch, ready } = params;

  // Vehicle layer: HTML markers w/ smooth client-side interpolation between ticks.
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  // Per-vehicle animation state: from/to coords & timestamps for interpolation
  const animRef = useRef<Map<string, Anim>>(new Map());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !state.showVehicles) {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      animRef.current.clear();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const TICK_MS = 12_000;
    let stopped = false;

    async function tick() {
      // Visible routes following the current filter
      const targets: Route[] = state.selectedRouteId
        ? state.routes.filter((r) => r.id === state.selectedRouteId)
        : state.routes.filter((r) => {
            if (state.modeFilter === "TRAM") return r.mode === "TRAM";
            if (state.modeFilter === "BUS") return r.mode === "BUS";
            return true; // ALL
          });

      const all: Vehicle[] = [];
      const results = await Promise.allSettled(
        targets.map((r) => fetch(`/api/vehicles/${r.id}`).then((x) => x.json()))
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value?.vehicles) all.push(...r.value.vehicles);
      }

      // Update "occupied stops" GeoJSON: stops currently hosting a vehicle
      const occupiedFeatures: any[] = [];
      const seenStops = new Set<string>();
      for (const v of all) {
        if (!v.atStopId || seenStops.has(`${v.atStopId}|${v.routeId}`)) continue;
        seenStops.add(`${v.atStopId}|${v.routeId}`);
        occupiedFeatures.push({
          type: "Feature",
          properties: { stopId: v.atStopId, color: v.color, line: v.shortName },
          geometry: { type: "Point", coordinates: [v.lon, v.lat] },
        });
      }
      const occSrc = map!.getSource("occupied-stops") as any;
      if (occSrc?.setData) {
        occSrc.setData({ type: "FeatureCollection", features: occupiedFeatures });
      }

      const now = performance.now();
      const seen = new Set<string>();
      for (const v of all) {
        seen.add(v.tripId);
        const existing = markersRef.current.get(v.tripId);
        const prevAnim = animRef.current.get(v.tripId);
        const fromLat = prevAnim ? interpLat(prevAnim, now) : v.lat;
        const fromLon = prevAnim ? interpLon(prevAnim, now) : v.lon;
        const fromBearing = prevAnim ? interpBearing(prevAnim, now) : v.bearing;
        animRef.current.set(v.tripId, {
          fromLat, fromLon, fromBearing,
          toLat: v.lat, toLon: v.lon, toBearing: v.bearing,
          startTs: now,
          endTs: now + TICK_MS,
          frozen: !!v.atStopId,
        });

        if (!existing) {
          const root = document.createElement("div");
          root.className = "m-vehicle";
          root.style.cssText = "transform-origin:center;will-change:transform;cursor:pointer;";
          const fg = readableOn(v.color);
          root.innerHTML = `
            <div class="vehicle-pulse" style="color:${v.color}">
              <div data-pill style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:999px;background:${v.color};color:${fg};font:700 11px/1 var(--font-sans);box-shadow:0 4px 10px rgba(0,0,0,.18),0 0 0 2px #fff;transition:transform 120ms ease-out;">
                ${v.shortName}
              </div>
            </div>`;
          root.addEventListener("click", (e) => {
            e.stopPropagation();
            dispatch({ type: "SELECT_ROUTE", id: v.routeId });
            dispatch({ type: "SELECT_VEHICLE", tripId: v.tripId });
          });
          const m = new maplibregl.Marker({ element: root, anchor: "center" })
            .setLngLat([fromLon, fromLat])
            .addTo(map!);
          markersRef.current.set(v.tripId, m);
        }
      }
      // Remove stale
      for (const [id, m] of markersRef.current) {
        if (!seen.has(id)) {
          m.remove();
          markersRef.current.delete(id);
          animRef.current.delete(id);
        }
      }
    }

    let lastFollow = 0;
    function loop() {
      const t = performance.now();
      let followLat: number | null = null, followLon: number | null = null;
      for (const [id, anim] of animRef.current) {
        const m = markersRef.current.get(id);
        if (!m) continue;
        const lat = interpLat(anim, t);
        const lon = interpLon(anim, t);
        m.setLngLat([lon, lat]);
        if (state.followVehicle && id === state.selectedVehicleTripId) {
          followLat = lat; followLon = lon;
        }
      }
      // Throttle follow-recentre to once every 600ms (smooth without fighting MapLibre)
      if (followLat !== null && followLon !== null && t - lastFollow > 600) {
        lastFollow = t;
        map!.easeTo({ center: [followLon, followLat], duration: 600, essential: true });
      }
      if (!stopped) rafRef.current = requestAnimationFrame(loop);
    }

    tick();
    const iv = setInterval(() => { if (!stopped) tick(); }, TICK_MS);
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      clearInterval(iv);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // Preserve original deps exactly (1:1 behavior) — followVehicle and
    // selectedVehicleTripId are intentionally read from the closure of the
    // raf loop without re-subscribing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, state.selectedRouteId, state.routes, state.modeFilter, state.showVehicles]);
}
