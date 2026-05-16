"use client";
import { useRef, useState } from "react";
import { Map as MLMap } from "maplibre-gl";
import { useApp } from "@/lib/store";
import { useMapInit } from "./map/useMapInit";
import { useThemeStyle } from "./map/useThemeStyle";
import { useRouteLineLayer } from "./map/useRouteLineLayer";
import { useStopLayer } from "./map/useStopLayer";
import { useHeatmapVisibility } from "./map/useHeatmapVisibility";
import { useParkingLayer } from "./map/useParkingLayer";
import { usePoiLayer } from "./map/usePoiLayer";
import { useDirectionArrowsLayer } from "./map/useDirectionArrowsLayer";
import { useFitSelectedRoute } from "./map/useFitSelectedRoute";
import { useSelectedStopsLayer } from "./map/useSelectedStopsLayer";
import { useOccupiedStopsLayer } from "./map/useOccupiedStopsLayer";
import { useVehicleLayer } from "./map/useVehicleLayer";

export default function MapView() {
  const mapRef = useRef<MLMap | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, dispatch } = useApp();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useMapInit({ containerRef, mapRef, theme: state.theme, onReady: () => setReady(true), onError: setError });
  useThemeStyle({ mapRef, theme: state.theme, ready });
  useRouteLineLayer({ mapRef, state, dispatch, ready });
  useStopLayer({ mapRef, state, dispatch, ready });
  useHeatmapVisibility({ mapRef, showHeatmap: state.showHeatmap, ready });
  useParkingLayer({ mapRef, theme: state.theme, ready });
  usePoiLayer({ mapRef, theme: state.theme, ready });
  useDirectionArrowsLayer({ mapRef, state, ready });
  useFitSelectedRoute({ mapRef, selectedRouteId: state.selectedRouteId });
  useSelectedStopsLayer({ mapRef, state, dispatch, ready });
  useOccupiedStopsLayer({ mapRef, theme: state.theme, ready });
  useVehicleLayer({ mapRef, state, dispatch, ready });

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg,#eef0f3,#dde2ea)",
        }}
      />
      {!ready && !error && (
        <div className="absolute top-4 right-4 z-30 px-3 py-2 rounded-lg bg-elev shadow-soft border text-xs text-muted animate-pulse">
          Initialisation de la carte…
        </div>
      )}
      {error && (
        <div className="absolute top-4 right-4 z-30 max-w-xs p-3 rounded-lg bg-danger text-white text-xs shadow-pop">
          Erreur carte : {error}
        </div>
      )}
    </>
  );
}
