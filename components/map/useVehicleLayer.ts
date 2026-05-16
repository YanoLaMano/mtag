"use client";
import { useEffect, useRef, RefObject } from "react";
import maplibregl, { Map as MLMap } from "maplibre-gl";
import type { Vehicle, Route } from "@/lib/types";
import { readableOn } from "@/lib/utils";
import { Anim, interpLat, interpLon, interpBearing } from "./anim";
import type { AppState, AppDispatch } from "./types";

// Approximate metric distance between two lat/lon (Pythagore + cos(lat) on
// the longitude axis — fine for the few-km deltas we care about here).
const COS_LAT = Math.cos((45.18 * Math.PI) / 180);
function distM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dx = (lon1 - lon2) * COS_LAT * 111_320;
  const dy = (lat1 - lat2) * 111_320;
  return Math.sqrt(dx * dx + dy * dy);
}
// At TICK_MS=12 s a tram never moves more than 200 m (60 km/h). Anything
// over this is upstream telling us "I lost the trip and found it again
// somewhere else" — animating across the gap would draw a wormhole.
const TELEPORT_THRESHOLD_M = 400;

/**
 * Per-route stable offset in screen pixels, in {-3..+3}. MUST match
 * useRouteLineLayer's `routeOffsetPx` exactly — that's the hash that
 * decides where the line is drawn relative to the street centerline,
 * and the vehicle marker has to land on that same offset line to look
 * "attached" to its own route.
 */
function routeOffsetPx(routeId: string): number {
  let h = 0;
  for (let i = 0; i < routeId.length; i++) h = (h * 31 + routeId.charCodeAt(i)) | 0;
  return (Math.abs(h) % 7) - 3;
}

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

    // Poll at 8 s to match the upstream stoptimes cache (revalidate=8) and
    // the SSE tick — keeps the marker chasing a fresh server prediction
    // instead of extrapolating from a 12-second-old sample.
    const TICK_MS = 8_000;
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
        let fromLat = prevAnim ? interpLat(prevAnim, now) : v.lat;
        let fromLon = prevAnim ? interpLon(prevAnim, now) : v.lon;
        let fromBearing = prevAnim ? interpBearing(prevAnim, now) : v.bearing;
        // Teleport rejection: if upstream jumps the trip more than ~400 m
        // between two ticks (impossible at any realistic transit speed over
        // 12 s), snap the marker — animating would draw a wormhole through
        // unrelated streets and confuse the user. The vehicle simply
        // reappears at the new position with no easing.
        if (prevAnim && distM(fromLat, fromLon, v.lat, v.lon) > TELEPORT_THRESHOLD_M) {
          fromLat = v.lat;
          fromLon = v.lon;
          fromBearing = v.bearing;
        }
        animRef.current.set(v.tripId, {
          fromLat, fromLon, fromBearing,
          toLat: v.lat, toLon: v.lon, toBearing: v.bearing,
          startTs: now,
          endTs: now + TICK_MS,
          frozen: !!v.atStopId,
        });
        routeByTrip.set(v.tripId, v.routeId);

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
          routeByTrip.delete(id);
          offsetByTrip.delete(id);
        }
      }
    }

    // Cache per-trip route offset so we don't hash on every frame.
    const offsetByTrip = new Map<string, number>();
    function getOffsetForTrip(tripId: string, routeId: string): number {
      let o = offsetByTrip.get(tripId);
      if (o === undefined) {
        o = routeOffsetPx(routeId);
        offsetByTrip.set(tripId, o);
      }
      return o;
    }
    // Stores routeId for each anim entry — needed to compute the perpendicular
    // offset in the rAF loop without dropping the per-vehicle Route lookup.
    const routeByTrip = new Map<string, string>();

    let lastFollow = 0;
    function loop() {
      const t = performance.now();
      let followLat: number | null = null, followLon: number | null = null;
      for (const [id, anim] of animRef.current) {
        const m = markersRef.current.get(id);
        if (!m) continue;
        const lat = interpLat(anim, t);
        const lon = interpLon(anim, t);
        const bearing = interpBearing(anim, t);
        const routeId = routeByTrip.get(id);
        // Apply the same per-route hash offset that the route line uses,
        // perpendicular to the vehicle's direction of motion, in screen
        // pixels (so the marker stays glued to the line at every zoom).
        // bearing is compass degrees (0=N, 90=E); the perpendicular-right
        // unit vector in screen space (y down) is (cos(β), sin(β)).
        const off = routeId ? getOffsetForTrip(id, routeId) : 0;
        if (off !== 0 && map) {
          const br = (bearing * Math.PI) / 180;
          const p = map.project([lon, lat]);
          const ll = map.unproject([p.x + off * Math.cos(br), p.y + off * Math.sin(br)]);
          m.setLngLat([ll.lng, ll.lat]);
          if (state.followVehicle && id === state.selectedVehicleTripId) {
            followLat = ll.lat; followLon = ll.lng;
          }
        } else {
          m.setLngLat([lon, lat]);
          if (state.followVehicle && id === state.selectedVehicleTripId) {
            followLat = lat; followLon = lon;
          }
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
