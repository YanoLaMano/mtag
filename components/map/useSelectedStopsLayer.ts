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
    const haloId = `${srcId}-halo`;
    const ringId = `${srcId}-ring`;
    const dotId = `${srcId}-dot`;
    const labelId = `${srcId}-label`;
    const allLayers = [haloId, ringId, dotId, labelId, srcId /* legacy */];
    if (!state.selectedRouteId) {
      for (const id of allLayers) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
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
          const color = hex(route.color);

          // Soft route-coloured glow — gives every arrêt of the line an
          // unmistakeable aura that pops off the basemap at any zoom.
          map.addLayer({
            id: haloId,
            type: "circle",
            source: srcId,
            paint: {
              "circle-radius": [
                "interpolate", ["linear"], ["zoom"],
                10, 6, 12, 10, 14, 14, 16, 20, 18, 28,
              ],
              "circle-color": color,
              "circle-opacity": 0.28,
              "circle-blur": 0.55,
              "circle-pitch-alignment": "map",
            },
          });

          // White outer ring — classic transit-map dot, bigger than before
          // (was 3-5-7, now 5-8-12) so each stop reads from far away.
          map.addLayer({
            id: ringId,
            type: "circle",
            source: srcId,
            paint: {
              "circle-radius": [
                "interpolate", ["linear"], ["zoom"],
                10, 4, 12, 6, 14, 8, 16, 11, 18, 14,
              ],
              "circle-color": "#ffffff",
              "circle-stroke-color": color,
              "circle-stroke-width": [
                "interpolate", ["linear"], ["zoom"], 10, 2, 14, 3, 18, 4,
              ],
              "circle-pitch-alignment": "map",
            },
          });

          // Inner coloured dot — fills the centre of the white ring so the
          // route colour reads even at very small zoom levels where the
          // 1-2 px white centre would otherwise dominate.
          map.addLayer({
            id: dotId,
            type: "circle",
            source: srcId,
            minzoom: 13,
            paint: {
              "circle-radius": [
                "interpolate", ["linear"], ["zoom"],
                13, 2.5, 14, 3.5, 16, 5, 18, 7,
              ],
              "circle-color": color,
              "circle-pitch-alignment": "map",
            },
          });

          // Stop names — only at street-level zoom so dense intersections
          // don't turn into a label soup. Halo for legibility on busy
          // basemaps.
          map.addLayer({
            id: labelId,
            type: "symbol",
            source: srcId,
            minzoom: 14,
            layout: {
              "text-field": ["get", "name"],
              "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
              "text-size": [
                "interpolate", ["linear"], ["zoom"], 14, 10, 17, 13,
              ],
              "text-anchor": "top",
              "text-offset": [0, 1.1],
              "text-allow-overlap": false,
              "text-optional": true,
            },
            paint: {
              "text-color": "#0b0d12",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1.4,
              "text-halo-blur": 0.4,
            },
          });

          // Register interaction handlers exactly once per source lifetime.
          // Click target is the ring layer (biggest hit-area among the
          // visible marks), so users don't need to aim at the tiny dot.
          const onStopClick = (e: any) => {
            const f = e.features?.[0];
            if (f) dispatch({ type: "SELECT_STOP", id: (f.properties as any).id });
          };
          const onStopEnter = () => { map.getCanvas().style.cursor = "pointer"; };
          const onStopLeave = () => { map.getCanvas().style.cursor = ""; };
          map.on("click", ringId, onStopClick);
          map.on("mouseenter", ringId, onStopEnter);
          map.on("mouseleave", ringId, onStopLeave);
        }
      });
  }, [ready, state.selectedRouteId, state.routes, state.theme, dispatch, mapRef]);
}
