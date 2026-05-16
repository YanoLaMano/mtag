"use client";
import { useEffect, RefObject } from "react";
import { Map as MLMap } from "maplibre-gl";

export function useHeatmapVisibility(params: {
  mapRef: RefObject<MLMap | null>;
  showHeatmap: boolean;
  ready: boolean;
}) {
  const { mapRef, showHeatmap, ready } = params;
  // Heatmap visibility follows store
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const id = "all-stops-heatmap";
    if (!map.getLayer(id)) return;
    map.setLayoutProperty(id, "visibility", showHeatmap ? "visible" : "none");
  }, [showHeatmap, ready, mapRef]);
}
