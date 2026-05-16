"use client";
import { useEffect, RefObject } from "react";
import { Map as MLMap } from "maplibre-gl";
import type { AppState, AppDispatch } from "./types";

export function useStopLayer(params: {
  mapRef: RefObject<MLMap | null>;
  state: AppState;
  dispatch: AppDispatch;
  ready: boolean;
}) {
  const { mapRef, state, dispatch, ready } = params;
  // Load ALL stops of the network (once)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const srcId = "all-stops";
    if (map.getSource(srcId)) return;

    fetch("/api/all-stops")
      .then((r) => r.json())
      .then((fc) => {
        if (!map.getSource(srcId)) {
          map.addSource(srcId, {
            type: "geojson",
            data: fc as any,
            cluster: true,
            clusterMaxZoom: 12,
            clusterRadius: 40,
          });

          // Cluster bubble (dezoom)
          map.addLayer({
            id: `${srcId}-clusters`,
            type: "circle",
            source: srcId,
            filter: ["has", "point_count"],
            paint: {
              "circle-color": [
                "step", ["get", "point_count"],
                "#94a3b8", 10, "#64748b", 30, "#dc1271",
              ],
              "circle-radius": [
                "step", ["get", "point_count"],
                14, 10, 18, 30, 22,
              ],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
              "circle-opacity": 0.92,
            },
          });
          map.addLayer({
            id: `${srcId}-clusters-count`,
            type: "symbol",
            source: srcId,
            filter: ["has", "point_count"],
            layout: {
              "text-field": "{point_count_abbreviated}",
              "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
              "text-size": 11,
            },
            paint: { "text-color": "#ffffff" },
          });

          // Layer 1: large soft white glow so stops stand out over coloured line traces
          map.addLayer({
            id: `${srcId}-glow`,
            type: "circle",
            source: srcId,
            filter: ["!", ["has", "point_count"]],
            minzoom: 11,
            paint: {
              "circle-radius": [
                "interpolate", ["linear"], ["zoom"],
                11, ["case", ["get", "hasTram"], 7, 4],
                13, ["case", ["get", "hasTram"], 10, 6],
                15, ["case", ["get", "hasTram"], 14, 9],
                17, ["case", ["get", "hasTram"], 18, 12],
              ],
              "circle-color": "#ffffff",
              "circle-blur": 0.4,
              "circle-opacity": [
                "interpolate", ["linear"], ["zoom"],
                11, 0.45, 13, 0.85, 15, 0.95,
              ],
            },
          });

          // Layer 2: crisp white ring (the "halo" carving through the line)
          map.addLayer({
            id: `${srcId}-halo`,
            type: "circle",
            source: srcId,
            filter: ["!", ["has", "point_count"]],
            minzoom: 11,
            paint: {
              "circle-radius": [
                "interpolate", ["linear"], ["zoom"],
                11, ["case", ["get", "hasTram"], 4.5, 2.4],
                13, ["case", ["get", "hasTram"], 6.5, 3.8],
                15, ["case", ["get", "hasTram"], 9, 5.5],
                17, ["case", ["get", "hasTram"], 12, 7.5],
              ],
              "circle-color": "#ffffff",
              "circle-stroke-width": 0,
              "circle-opacity": 1,
            },
          });

          // Layer 3: inner coloured dot — couleur gradient selon hub level
          map.addLayer({
            id: srcId,
            type: "circle",
            source: srcId,
            filter: ["!", ["has", "point_count"]],
            minzoom: 11,
            paint: {
              "circle-radius": [
                "interpolate", ["linear"], ["zoom"],
                11, ["case", ["get", "hasTram"], 2.8, 1.4],
                13, ["case", ["get", "hasTram"], 4.4, 2.4],
                15, ["case", ["get", "hasTram"], 6.4, 3.6],
                17, ["case", ["get", "hasTram"], 9, 5.2],
              ],
              // Hub gradient: 1 line = neutral grey, 2 = darker, 3 = warm orange, 4+ = magenta hub, tram always dark
              "circle-color": [
                "case",
                ["get", "hasTram"], "#161a23",
                [">=", ["get", "linesCount"], 4], "#dc1271",
                [">=", ["get", "linesCount"], 3], "#f97316",
                [">=", ["get", "linesCount"], 2], "#475569",
                "#64748b",
              ],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": [
                "interpolate", ["linear"], ["zoom"],
                11, 0.6, 14, 1.4, 17, 2,
              ],
              "circle-opacity": 1,
            },
          });

          // Heatmap layer (toggle controlled)
          map.addLayer({
            id: `${srcId}-heatmap`,
            type: "heatmap",
            source: srcId,
            filter: ["!", ["has", "point_count"]],
            maxzoom: 16,
            layout: { visibility: "none" },
            paint: {
              "heatmap-weight": [
                "interpolate", ["linear"], ["get", "linesCount"],
                1, 0.25, 4, 1,
              ],
              "heatmap-intensity": [
                "interpolate", ["linear"], ["zoom"],
                10, 0.6, 15, 1.6,
              ],
              "heatmap-radius": [
                "interpolate", ["linear"], ["zoom"],
                10, 18, 14, 36, 16, 60,
              ],
              "heatmap-opacity": [
                "interpolate", ["linear"], ["zoom"],
                10, 0.85, 15, 0.6, 16, 0,
              ],
              "heatmap-color": [
                "interpolate", ["linear"], ["heatmap-density"],
                0, "rgba(0,0,0,0)",
                0.2, "rgba(59,130,246,0.4)",
                0.4, "rgba(34,197,94,0.6)",
                0.6, "rgba(234,179,8,0.7)",
                0.8, "rgba(249,115,22,0.85)",
                1, "rgba(220,18,113,0.95)",
              ],
            },
          });
          // Labels at higher zoom
          map.addLayer({
            id: `${srcId}-label`,
            type: "symbol",
            source: srcId,
            filter: ["!", ["has", "point_count"]],
            minzoom: 14.5,
            layout: {
              "text-field": ["get", "name"],
              "text-size": ["interpolate", ["linear"], ["zoom"], 14.5, 10, 17, 13],
              "text-offset": [0, 1.1],
              "text-anchor": "top",
              "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
              "text-optional": true,
              "text-allow-overlap": false,
            },
            paint: {
              "text-color": "#161a23",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1.4,
            },
          });

          map.on("click", srcId, (e) => {
            const f = e.features?.[0];
            if (f) dispatch({ type: "SELECT_STOP", id: (f.properties as any).id });
          });
          map.on("mouseenter", srcId, () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", srcId, () => (map.getCanvas().style.cursor = ""));

          // Cluster click → zoom in
          map.on("click", `${srcId}-clusters`, async (e) => {
            const features = map.queryRenderedFeatures(e.point, { layers: [`${srcId}-clusters`] });
            const cluster = features[0];
            if (!cluster) return;
            const clusterId = (cluster.properties as any).cluster_id;
            const src: any = map.getSource(srcId);
            try {
              const zoom = await src.getClusterExpansionZoom(clusterId);
              map.easeTo({
                center: (cluster.geometry as any).coordinates,
                zoom: Math.max(zoom, map.getZoom() + 1.2),
                duration: 600,
              });
            } catch {}
          });
          map.on("mouseenter", `${srcId}-clusters`, () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", `${srcId}-clusters`, () => (map.getCanvas().style.cursor = ""));
        }
      })
      .catch(() => { /* graceful */ });
  }, [ready, state.theme, dispatch, mapRef]);
}
