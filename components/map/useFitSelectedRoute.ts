"use client";
import { useEffect, RefObject } from "react";
import { Map as MLMap, LngLatBoundsLike } from "maplibre-gl";
import type { LineGeometry } from "@/lib/types";

export function useFitSelectedRoute(params: {
  mapRef: RefObject<MLMap | null>;
  selectedRouteId: string | null;
}) {
  const { mapRef, selectedRouteId } = params;
  // Fit bounds when selecting a route
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedRouteId) return;

    const tryFit = (): boolean => {
      const cache: Map<string, LineGeometry> = (map as any).__geomCache ?? new Map();
      const data = cache.get(selectedRouteId);
      if (!data) return false;
      const coords: [number, number][] = [];
      for (const f of data.features) {
        const c = f.geometry.coordinates as any;
        if (f.geometry.type === "MultiLineString") c.forEach((line: any) => line.forEach((p: any) => coords.push(p)));
        else c.forEach((p: any) => coords.push(p));
      }
      if (!coords.length) return false;
      const lons = coords.map((p) => p[0]);
      const lats = coords.map((p) => p[1]);
      map.fitBounds(
        [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]] as LngLatBoundsLike,
        { padding: { top: 80, right: 80, bottom: 80, left: 460 }, duration: 700, maxZoom: 14 }
      );
      return true;
    };

    // Fast path: geometry already cached.
    if (tryFit()) return;

    // Slow path: route was clicked before its geometry resolved. Listen for
    // the cache population event from useRouteLineLayer and retry once.
    const onLoaded = (ev: Event) => {
      const ce = ev as CustomEvent<{ routeId: string }>;
      if (ce.detail?.routeId !== selectedRouteId) return;
      tryFit();
    };
    window.addEventListener("m-line-geometry-loaded", onLoaded);
    return () => window.removeEventListener("m-line-geometry-loaded", onLoaded);
  }, [selectedRouteId, mapRef]);
}
