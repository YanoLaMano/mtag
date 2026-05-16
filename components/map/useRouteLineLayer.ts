"use client";
import { useEffect, RefObject } from "react";
import { Map as MLMap } from "maplibre-gl";
import type { LineGeometry } from "@/lib/types";
import { hex } from "@/lib/utils";
import type { AppState, AppDispatch } from "./types";

export function useRouteLineLayer(params: {
  mapRef: RefObject<MLMap | null>;
  state: AppState;
  dispatch: AppDispatch;
  ready: boolean;
}) {
  const { mapRef, state, dispatch, ready } = params;
  // Add/update all lines when routes load or filter changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || state.routes.length === 0) return;

    const visible = state.routes.filter((r) => {
      if (state.modeFilter === "TRAM") return r.mode === "TRAM";
      if (state.modeFilter === "BUS") return r.mode === "BUS";
      return true;
    });

    // Lazily load geometry once per route, cached in a Map on the map instance
    const cache: Map<string, LineGeometry> =
      (map as any).__geomCache ?? ((map as any).__geomCache = new Map());

    // Stable per-route offset in [-3, +3] pixels, deterministic from routeId.
    // The upstream API returns a single LineString per route (verified across
    // tram + Chrono + Proximo). Multiple routes share streets (Verdun-Préf,
    // Chavant, Gares…) so a naive zero-offset would stack them and only the
    // topmost color would be visible — the official M réso map "bundles"
    // shared corridors by hand. We approximate that with a hash-based jitter
    // small enough that every line stays glued to the real street centerline
    // (max ~9 m at zoom 18, sub-meter at city scale).
    function routeOffsetPx(routeId: string): number {
      let h = 0;
      for (let i = 0; i < routeId.length; i++) h = (h * 31 + routeId.charCodeAt(i)) | 0;
      return (Math.abs(h) % 7) - 3; // {-3,-2,-1,0,1,2,3}
    }
    (async () => {
      for (const r of visible) {
        if (cache.has(r.id)) continue;
        try {
          const data: LineGeometry = await fetch(`/api/line/${r.id}`).then((x) => x.json());
          cache.set(r.id, data);
          // Notify listeners (e.g. useFitSelectedRoute) that geometry for this
          // route just landed. Lets a route picked before its geometry resolved
          // still get a camera fit on first fetch RTT.
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("m-line-geometry-loaded", { detail: { routeId: r.id } })
            );
          }
          const srcId = `line-${r.id}`;
          if (!map.getSource(srcId)) {
            // Normalize any MultiLineString to a flat list of LineString features.
            // No per-direction split or sign flip — the upstream geometry has no
            // direction info (it's a single street centerline), so faking two
            // tracks just drifts the trace off the real road.
            const features: any[] = [];
            for (const feat of data.features || []) {
              const g: any = feat.geometry;
              if (g?.type === "MultiLineString") {
                for (const coords of g.coordinates as any[]) {
                  features.push({
                    type: "Feature",
                    properties: { ...feat.properties },
                    geometry: { type: "LineString", coordinates: coords },
                  });
                }
              } else if (g?.type === "LineString") {
                features.push({ type: "Feature", properties: { ...feat.properties }, geometry: g });
              }
            }
            map.addSource(srcId, { type: "geojson", data: { type: "FeatureCollection", features } as any });
            const beforeId = map.getLayer("all-stops-glow") ? "all-stops-glow" : undefined;
            const offset = routeOffsetPx(r.id);
            map.addLayer({
              id: `${srcId}-halo`,
              type: "line",
              source: srcId,
              layout: { "line-join": "round", "line-cap": "round" },
              paint: {
                "line-color": "#ffffff",
                "line-width": r.mode === "TRAM" ? 7 : 5,
                "line-opacity": 0.85,
                "line-offset": offset,
              },
            }, beforeId);
            map.addLayer({
              id: srcId,
              type: "line",
              source: srcId,
              layout: { "line-join": "round", "line-cap": "round" },
              paint: {
                "line-color": hex(r.color),
                "line-width": r.mode === "TRAM" ? 4.5 : 3,
                "line-opacity": 0.95,
                "line-offset": offset,
              },
            }, beforeId);
            // Click → select line
            const onClick = () => dispatch({ type: "SELECT_ROUTE", id: r.id });
            map.on("click", srcId, onClick);
            map.on("mouseenter", srcId, () => (map.getCanvas().style.cursor = "pointer"));
            map.on("mouseleave", srcId, () => (map.getCanvas().style.cursor = ""));
          }
        } catch (e) { /* tolerated */ }
      }
    })();

    // Toggle visibility
    for (const r of state.routes) {
      const srcId = `line-${r.id}`;
      const layers = [srcId, `${srcId}-halo`];
      const show = visible.includes(r) &&
        (!state.selectedRouteId || state.selectedRouteId === r.id);
      for (const id of layers) {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, "visibility", show ? "visible" : "none");
        }
      }
    }
  }, [ready, state.routes, state.modeFilter, state.selectedRouteId, state.theme, dispatch, mapRef]);
}
