"use client";
import { useEffect, RefObject } from "react";
import { Map as MLMap } from "maplibre-gl";
import type { AppState } from "./types";

export function useDirectionArrowsLayer(params: {
  mapRef: RefObject<MLMap | null>;
  state: AppState;
  ready: boolean;
}) {
  const { mapRef, state, ready } = params;
  // Direction arrows along the selected line
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const arrowImg = "line-arrow";

    // Lazy-create an arrow icon once
    if (!map.hasImage(arrowImg)) {
      const c = document.createElement("canvas");
      c.width = 48; c.height = 48; // 2x of 24
      const ctx = c.getContext("2d")!;
      ctx.scale(2, 2);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1.2;
      // Right-pointing chevron
      ctx.beginPath();
      ctx.moveTo(7, 4);
      ctx.lineTo(17, 12);
      ctx.lineTo(7, 20);
      ctx.lineTo(11, 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const id = ctx.getImageData(0, 0, c.width, c.height);
      map.addImage(arrowImg, id, { pixelRatio: 2 });
    }

    // Clean up if no selection
    const layerId = "selected-line-arrows";
    if (!state.selectedRouteId) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      return;
    }
    const srcId = `line-${state.selectedRouteId}`;
    if (!map.getSource(srcId)) return;

    if (map.getLayer(layerId)) map.removeLayer(layerId);
    map.addLayer({
      id: layerId,
      type: "symbol",
      source: srcId,
      minzoom: 12,
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 110,
        "icon-image": arrowImg,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.5, 16, 0.9],
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-keep-upright": false,
      },
    });
  }, [ready, state.selectedRouteId, state.theme, state.routes, mapRef]);
}
