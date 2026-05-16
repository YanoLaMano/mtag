"use client";
import { useEffect, RefObject } from "react";
import { Map as MLMap } from "maplibre-gl";
import type { Stop } from "@/lib/types";
import { hex } from "@/lib/utils";
import type { AppState, AppDispatch } from "./types";

export function useSelectedStopsLayer(params: {
  mapRef: RefObject<MLMap | null>;
  state: AppState;
  dispatch: AppDispatch;
  ready: boolean;
}) {
  const { mapRef, state, dispatch, ready } = params;
  // Load stops of selected route
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const srcId = "selected-stops";
    if (!state.selectedRouteId) {
      if (map.getLayer(srcId)) map.removeLayer(srcId);
      if (map.getLayer(`${srcId}-label`)) map.removeLayer(`${srcId}-label`);
      if (map.getSource(srcId)) map.removeSource(srcId);
      return;
    }
    const route = state.routes.find((r) => r.id === state.selectedRouteId);
    if (!route) return;
    fetch(`/api/stops/${state.selectedRouteId}`)
      .then((r) => r.json())
      .then((stops: Stop[]) => {
        const fc = {
          type: "FeatureCollection",
          features: stops.map((s) => ({
            type: "Feature",
            properties: { id: s.gtfsId, name: s.name },
            geometry: { type: "Point", coordinates: [s.lon, s.lat] },
          })),
        };
        if (map.getSource(srcId)) {
          (map.getSource(srcId) as any).setData(fc);
        } else {
          map.addSource(srcId, { type: "geojson", data: fc as any });
          map.addLayer({
            id: srcId,
            type: "circle",
            source: srcId,
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 3, 14, 5, 16, 7],
              "circle-color": "#ffffff",
              "circle-stroke-color": hex(route.color),
              "circle-stroke-width": 2.5,
              "circle-pitch-alignment": "map",
            },
          });
        }
        map.on("click", srcId, (e) => {
          const f = e.features?.[0];
          if (f) dispatch({ type: "SELECT_STOP", id: (f.properties as any).id });
        });
        map.on("mouseenter", srcId, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", srcId, () => (map.getCanvas().style.cursor = ""));
      });
  }, [ready, state.selectedRouteId, state.routes, state.theme, dispatch, mapRef]);
}
