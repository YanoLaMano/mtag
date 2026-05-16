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

    (async () => {
      for (const r of visible) {
        if (cache.has(r.id)) continue;
        try {
          const data: LineGeometry = await fetch(`/api/line/${r.id}`).then((x) => x.json());
          cache.set(r.id, data);
          const srcId = `line-${r.id}`;
          if (!map.getSource(srcId)) {
            // Split MultiLineString into per-direction features with alternating offset
            const features: any[] = [];
            for (const feat of data.features || []) {
              const g: any = feat.geometry;
              if (g?.type === "MultiLineString") {
                (g.coordinates as any[]).forEach((coords, i) => {
                  features.push({
                    type: "Feature",
                    properties: { ...feat.properties, dir: i, sign: i % 2 === 0 ? -1 : 1 },
                    geometry: { type: "LineString", coordinates: coords },
                  });
                });
              } else if (g?.type === "LineString") {
                features.push({
                  type: "Feature",
                  properties: { ...feat.properties, dir: 0, sign: -1 },
                  geometry: g,
                });
              }
            }
            map.addSource(srcId, { type: "geojson", data: { type: "FeatureCollection", features } as any });
            const beforeId = map.getLayer("all-stops-glow") ? "all-stops-glow" : undefined;
            const halfWidth = r.mode === "TRAM" ? 4.5 : 3;
            // Per-direction offset: ±halfWidth so the two tracks are visually parallel
            const offsetExpr: any = [
              "interpolate", ["linear"], ["zoom"],
              11, ["*", ["get", "sign"], 0],
              13, ["*", ["get", "sign"], halfWidth * 0.5],
              16, ["*", ["get", "sign"], halfWidth],
              18, ["*", ["get", "sign"], halfWidth * 1.3],
            ];
            map.addLayer({
              id: `${srcId}-halo`,
              type: "line",
              source: srcId,
              layout: { "line-join": "round", "line-cap": "round" },
              paint: {
                "line-color": "#ffffff",
                "line-width": r.mode === "TRAM" ? 7 : 5,
                "line-opacity": 0.85,
                "line-offset": offsetExpr,
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
                "line-offset": offsetExpr,
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
