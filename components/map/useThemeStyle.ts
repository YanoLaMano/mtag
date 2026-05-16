"use client";
import { useEffect, RefObject } from "react";
import { Map as MLMap } from "maplibre-gl";

type Theme = "light" | "dark";

export function useThemeStyle(params: {
  mapRef: RefObject<MLMap | null>;
  theme: Theme;
  ready: boolean;
}) {
  const { mapRef, theme, ready } = params;
  // Swap basemap tiles on theme change WITHOUT touching other layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!map.isStyleLoaded()) return;
    const variant = theme === "dark" ? "dark_all" : "light_all";
    const tiles = [
      `https://a.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}@2x.png`,
      `https://b.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}@2x.png`,
      `https://c.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}@2x.png`,
      `https://d.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}@2x.png`,
    ];
    const bgColor = theme === "dark" ? "#0e1117" : "#eef0f3";
    if (map.getLayer("bg")) {
      map.setPaintProperty("bg", "background-color", bgColor);
    }
    // Replace the raster source by removing & re-adding the basemap source/layer in place
    if (map.getLayer("basemap") && map.getSource("basemap")) {
      map.removeLayer("basemap");
      map.removeSource("basemap");
      map.addSource("basemap", {
        type: "raster",
        tiles,
        tileSize: 256,
      } as any);
      // re-insert basemap layer right above background, below everything else
      const firstAfter = map.getStyle().layers?.find((l) => l.id !== "bg")?.id;
      map.addLayer(
        { id: "basemap", type: "raster", source: "basemap" } as any,
        firstAfter
      );
    }
  }, [theme, ready, mapRef]);
}
