"use client";
import { useEffect, RefObject } from "react";
import { Map as MLMap } from "maplibre-gl";

type Theme = "light" | "dark";

export function useOccupiedStopsLayer(params: {
  mapRef: RefObject<MLMap | null>;
  theme: Theme;
  ready: boolean;
}) {
  const { mapRef, theme, ready } = params;
  // Occupied stops source (vehicles currently at a stop) — coloured pulsing ring
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const srcId = "occupied-stops";
    if (map.getSource(srcId)) return;
    map.addSource(srcId, { type: "geojson", data: { type: "FeatureCollection", features: [] } as any });
    // Insert below the selected-stops halo when it exists, so the selected
    // route's full visual stack (halo/ring/dot/label) stays on top of the
    // translucent "occupied" outer ring (otherwise the 20px outer ring of
    // occupied-stops would cover the selected stop's indicator).
    const haloId = "selected-stops-halo";
    const beforeId = map.getLayer(haloId) ? haloId : undefined;
    map.addLayer({
      id: `${srcId}-outer`,
      type: "circle",
      source: srcId,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 8, 14, 13, 17, 20],
        "circle-color": ["get", "color"],
        "circle-opacity": 0.18,
        "circle-stroke-color": ["get", "color"],
        "circle-stroke-width": 1.5,
        "circle-stroke-opacity": 0.6,
      },
    }, beforeId);
    map.addLayer({
      id: srcId,
      type: "circle",
      source: srcId,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 4, 14, 6, 17, 9],
        "circle-color": ["get", "color"],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    }, beforeId);
  }, [ready, theme, mapRef]);

  // Re-stack occupied-stops layers whenever the layer list changes.
  // useSelectedStopsLayer adds/removes its halo/ring/dot/label layers on
  // each selection change; the freshly-added selected-stops layers land on
  // top of occupied-stops by default, but the user wants the relationship
  // reversed only WHEN selected-stops exist. When no route is selected
  // (no selected-stops-halo), occupied-stops stay on top of the basemap.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const outerId = "occupied-stops-outer";
    const dotId = "occupied-stops";
    const haloId = "selected-stops-halo";
    const restack = () => {
      if (!map.getLayer(outerId) || !map.getLayer(dotId)) return;
      try {
        if (map.getLayer(haloId)) {
          map.moveLayer(outerId, haloId);
          map.moveLayer(dotId, haloId);
        } else {
          map.moveLayer(outerId);
          map.moveLayer(dotId);
        }
      } catch { /* layer ordering races during teardown — non-fatal */ }
    };
    restack();
    map.on("styledata", restack);
    return () => {
      map.off("styledata", restack);
    };
  }, [ready, mapRef]);
}
