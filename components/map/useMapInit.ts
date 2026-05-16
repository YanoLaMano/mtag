"use client";
import { useEffect, RefObject } from "react";
import maplibregl, { Map as MLMap } from "maplibre-gl";
import { GRENOBLE, makeStyle } from "./style";

type Theme = "light" | "dark";

export function useMapInit(params: {
  containerRef: RefObject<HTMLDivElement | null>;
  mapRef: RefObject<MLMap | null>;
  theme: Theme;
  onReady: () => void;
  onError: (msg: string) => void;
}) {
  const { containerRef, mapRef, theme, onReady, onError } = params;
  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let map: MLMap;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: makeStyle(theme) as any,
        center: GRENOBLE,
        zoom: 12.2,
        minZoom: 10.5,
        maxZoom: 18,
        maxBounds: [
          [5.35, 44.95],
          [6.05, 45.45],
        ],
        attributionControl: { compact: true },
        hash: false,
      });
      map.on("error", (e) => {
        console.error("[maplibre]", e?.error?.message || e);
      });
    } catch (e: any) {
      console.error("[maplibre init]", e);
      onError(e?.message || String(e));
      return;
    }
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "bottom-right");
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      } as any),
      "bottom-right"
    );
    map.on("load", () => onReady());
    (mapRef as { current: MLMap | null }).current = map;
    (window as any).__mMap = map; // expose for particle bursts / external utils
    return () => { map.remove(); (mapRef as { current: MLMap | null }).current = null; delete (window as any).__mMap; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
