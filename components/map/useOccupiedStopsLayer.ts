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
    });
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
    });
  }, [ready, theme, mapRef]);
}
