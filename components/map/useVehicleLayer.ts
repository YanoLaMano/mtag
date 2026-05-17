"use client";
import { useEffect, useMemo, useRef, RefObject } from "react";
import maplibregl, { Map as MLMap } from "maplibre-gl";
import type { Vehicle, Route } from "@/lib/types";
import { readableOn } from "@/lib/utils";
import { useVehiclesForRoutes } from "@/lib/vehicles-store";
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
  // Stores routeId for each anim entry — needed to compute the perpendicular
  // offset in the rAF loop without dropping the per-vehicle Route lookup.
  const routeByTripRef = useRef<Map<string, string>>(new Map());
  // Cache per-trip route offset so we don't hash on every frame.
  const offsetByTripRef = useRef<Map<string, number>>(new Map());
  // Direct refs into the marker DOM so we can rotate the arrow each rAF
  // frame and flip the data-dwelling / data-selected attributes without
  // re-rendering the whole marker.
  const rotatorByTripRef = useRef<Map<string, HTMLElement>>(new Map());
  const wrapByTripRef = useRef<Map<string, HTMLElement>>(new Map());
  const rafRef = useRef<number | null>(null);

  // Compute the route set we want to follow. Memoized so the array identity
  // stays stable between renders that don't change the selection — otherwise
  // useVehiclesForRoutes would resubscribe constantly.
  const targetRouteIds = useMemo<string[]>(() => {
    if (!state.showVehicles) return [];
    const targets: Route[] = state.selectedRouteId
      ? state.routes.filter((r) => r.id === state.selectedRouteId)
      : state.routes.filter((r) => {
          if (state.modeFilter === "TRAM") return r.mode === "TRAM";
          if (state.modeFilter === "BUS") return r.mode === "BUS";
          return true; // ALL
        });
    return targets.map((r) => r.id);
  }, [state.showVehicles, state.selectedRouteId, state.routes, state.modeFilter]);

  // Single source of truth: the central store. One fetch per route id per
  // 8 s, shared across every consumer in the tree.
  const { all, lastUpdate } = useVehiclesForRoutes(targetRouteIds);

  // React to each new snapshot — refresh markers/anims/occupied stops.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !state.showVehicles) return;
    if (lastUpdate == null) return; // nothing fetched yet

    // Poll cadence the animation easing was tuned against; keeping the same
    // constant means interpBearing/interpLat reach `to` exactly when the next
    // snapshot lands.
    const TICK_MS = 8_000;

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
    const occSrc = map.getSource("occupied-stops") as any;
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
      // If the bearing change this tick is huge (~terminus turnaround,
      // 180° flip), stretch the bearing transition over 2× TICK_MS so
      // the visible rotation is a slower swing instead of an instant
      // whip. Inline the wrap-aware delta (matches interpBearing).
      let bdiff = v.bearing - fromBearing;
      if (bdiff > 180) bdiff -= 360;
      else if (bdiff < -180) bdiff += 360;
      const endTs = now + TICK_MS;
      const bearingEndTs = Math.abs(bdiff) > 150 ? now + 2 * TICK_MS : endTs;
      animRef.current.set(v.tripId, {
        fromLat, fromLon, fromBearing,
        toLat: v.lat, toLon: v.lon, toBearing: v.bearing,
        startTs: now,
        endTs,
        bearingEndTs,
        frozen: !!v.atStopId,
      });
      routeByTripRef.current.set(v.tripId, v.routeId);

      if (!existing) {
        const root = document.createElement("div");
        const fg = readableOn(v.color);
        // The wrap inherits the route color so the arrow + halo can use
        // currentColor; the pill overrides with its own background+text.
        root.innerHTML = `
          <div class="m-vehicle-wrap" data-dwelling="${v.atStopId ? "true" : "false"}" style="color:${v.color}">
            <div class="m-vehicle-arrow-rotator" data-arrow-rotator>
              <div class="m-vehicle-arrow"></div>
            </div>
            <div class="m-vehicle-halo" aria-hidden="true"></div>
            <div class="m-vehicle-pill" style="background:${v.color};color:${fg}">${v.shortName}</div>
          </div>`;
        root.addEventListener("click", (e) => {
          e.stopPropagation();
          dispatch({ type: "SELECT_ROUTE", id: v.routeId });
          dispatch({ type: "SELECT_VEHICLE", tripId: v.tripId });
        });
        const m = new maplibregl.Marker({ element: root, anchor: "center" })
          .setLngLat([fromLon, fromLat])
          .addTo(map);
        markersRef.current.set(v.tripId, m);
        const wrap = root.querySelector(".m-vehicle-wrap") as HTMLElement | null;
        const rot = root.querySelector("[data-arrow-rotator]") as HTMLElement | null;
        if (wrap) wrapByTripRef.current.set(v.tripId, wrap);
        if (rot) rotatorByTripRef.current.set(v.tripId, rot);
      } else {
        // Flip the dwelling attr on the existing marker so the CSS halo
        // pulse turns on/off without rebuilding the DOM.
        const wrap = wrapByTripRef.current.get(v.tripId);
        if (wrap) wrap.dataset.dwelling = v.atStopId ? "true" : "false";
      }
    }
    // Remove stale
    for (const [id, m] of markersRef.current) {
      if (!seen.has(id)) {
        m.remove();
        markersRef.current.delete(id);
        animRef.current.delete(id);
        routeByTripRef.current.delete(id);
        offsetByTripRef.current.delete(id);
        rotatorByTripRef.current.delete(id);
        wrapByTripRef.current.delete(id);
      }
    }
    // We intentionally depend on `lastUpdate` (changes every poll) rather than
    // `all` (a fresh array every render even when contents are unchanged) —
    // the store mints a new snapshot only when a poll completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastUpdate, ready, state.showVehicles]);

  // Animation rAF + teardown. Runs as long as the layer is enabled; reads
  // refs for current anim state so it doesn't restart per tick.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !state.showVehicles) {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      animRef.current.clear();
      routeByTripRef.current.clear();
      offsetByTripRef.current.clear();
      rotatorByTripRef.current.clear();
      wrapByTripRef.current.clear();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    let stopped = false;

    function getOffsetForTrip(tripId: string, routeId: string): number {
      let o = offsetByTripRef.current.get(tripId);
      if (o === undefined) {
        o = routeOffsetPx(routeId);
        offsetByTripRef.current.set(tripId, o);
      }
      return o;
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
        const bearing = interpBearing(anim, t);
        // Rotate the arrow chevron to match direction of motion. The
        // wrapping rotator's transform-origin is the pill center so the
        // pill itself stays upright (text readable) — only the chevron
        // orbits around it.
        const rot = rotatorByTripRef.current.get(id);
        if (rot) rot.style.transform = `rotate(${bearing}deg)`;
        const routeId = routeByTripRef.current.get(id);
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
      // Reflect the followed-vehicle selection in the DOM so the CSS
      // ring outlines the currently selected marker. Runs every frame
      // but only writes when the attribute changes — cheap.
      for (const [id, wrap] of wrapByTripRef.current) {
        const want = state.followVehicle && id === state.selectedVehicleTripId ? "true" : "false";
        if (wrap.dataset.selected !== want) wrap.dataset.selected = want;
      }
      if (!stopped) rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // followVehicle/selectedVehicleTripId are intentionally read from the
    // closure of the raf loop without re-subscribing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, state.showVehicles]);
}
