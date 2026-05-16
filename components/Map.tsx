"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MLMap, LngLatBoundsLike } from "maplibre-gl";
import { useApp } from "@/lib/store";
import type { LineGeometry, Stop, Vehicle, Route } from "@/lib/types";
import { hex, readableOn } from "@/lib/utils";

const GRENOBLE: [number, number] = [5.7245, 45.1885];

// Smooth animation helpers
type Anim = {
  fromLat: number; fromLon: number; fromBearing: number;
  toLat: number; toLon: number; toBearing: number;
  startTs: number; endTs: number;
};
function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }
function fracOf(a: Anim, now: number) {
  if (now <= a.startTs) return 0;
  if (now >= a.endTs) return 1;
  return easeOutCubic((now - a.startTs) / (a.endTs - a.startTs));
}
function interpLat(a: Anim, now: number) { const k = fracOf(a, now); return a.fromLat + (a.toLat - a.fromLat) * k; }
function interpLon(a: Anim, now: number) { const k = fracOf(a, now); return a.fromLon + (a.toLon - a.fromLon) * k; }
function interpBearing(a: Anim, now: number) {
  const k = fracOf(a, now);
  let diff = a.toBearing - a.fromBearing;
  if (diff > 180) diff -= 360; else if (diff < -180) diff += 360;
  return (a.fromBearing + diff * k + 360) % 360;
}
const STYLE_URL =
  "https://api.maptiler.com/maps/dataviz-light/style.json?key=get_your_own_OpIi9ZULNHzrESv6T2vL";
// Fallback OSM raster style so it works without any key.
function makeStyle(theme: "light" | "dark") {
  const variant = theme === "dark" ? "dark_all" : "light_all";
  const bg = theme === "dark" ? "#0e1117" : "#eef0f3";
  return {
    version: 8 as const,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      basemap: {
        type: "raster" as const,
        tiles: [
          `https://a.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}@2x.png`,
          `https://b.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}@2x.png`,
          `https://c.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}@2x.png`,
          `https://d.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}@2x.png`,
        ],
        tileSize: 256,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>',
      },
    },
    layers: [
      { id: "bg", type: "background" as const, paint: { "background-color": bg } },
      { id: "basemap", type: "raster" as const, source: "basemap" },
    ],
  };
}
const FALLBACK_STYLE = makeStyle("light");

export default function MapView() {
  const mapRef = useRef<MLMap | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, dispatch } = useApp();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let map: MLMap;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: makeStyle(state.theme) as any,
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
      setError(e?.message || String(e));
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
    map.on("load", () => setReady(true));
    mapRef.current = map;
    (window as any).__mMap = map; // expose for particle bursts / external utils
    return () => { map.remove(); mapRef.current = null; delete (window as any).__mMap; };
  }, []);

  // Swap basemap tiles on theme change WITHOUT touching other layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!map.isStyleLoaded()) return;
    const variant = state.theme === "dark" ? "dark_all" : "light_all";
    const tiles = [
      `https://a.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}@2x.png`,
      `https://b.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}@2x.png`,
      `https://c.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}@2x.png`,
      `https://d.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}@2x.png`,
    ];
    const bgColor = state.theme === "dark" ? "#0e1117" : "#eef0f3";
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
  }, [state.theme, ready]);

  // Add/update all lines when routes load or filter changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || state.routes.length === 0) return;

    const visible = state.routes.filter((r) => {
      if (state.modeFilter === "TRAM") return r.mode === "TRAM";
      if (state.modeFilter === "BUS") return r.mode === "BUS";
      return true;
    });

    // Lazily load geometry once per route, cached in a Map on the map instance
    const cache: Map<string, LineGeometry> =
      (map as any).__geomCache ?? ((map as any).__geomCache = new Map());

    (async () => {
      for (const r of visible) {
        if (cache.has(r.id)) continue;
        try {
          const data: LineGeometry = await fetch(`/api/line/${r.id}`).then((x) => x.json());
          cache.set(r.id, data);
          const srcId = `line-${r.id}`;
          if (!map.getSource(srcId)) {
            // Split MultiLineString into per-direction features with alternating offset
            const features: any[] = [];
            for (const feat of data.features || []) {
              const g: any = feat.geometry;
              if (g?.type === "MultiLineString") {
                (g.coordinates as any[]).forEach((coords, i) => {
                  features.push({
                    type: "Feature",
                    properties: { ...feat.properties, dir: i, sign: i % 2 === 0 ? -1 : 1 },
                    geometry: { type: "LineString", coordinates: coords },
                  });
                });
              } else if (g?.type === "LineString") {
                features.push({
                  type: "Feature",
                  properties: { ...feat.properties, dir: 0, sign: -1 },
                  geometry: g,
                });
              }
            }
            map.addSource(srcId, { type: "geojson", data: { type: "FeatureCollection", features } as any });
            const beforeId = map.getLayer("all-stops-glow") ? "all-stops-glow" : undefined;
            const halfWidth = r.mode === "TRAM" ? 4.5 : 3;
            // Per-direction offset: ±halfWidth so the two tracks are visually parallel
            const offsetExpr: any = [
              "interpolate", ["linear"], ["zoom"],
              11, ["*", ["get", "sign"], 0],
              13, ["*", ["get", "sign"], halfWidth * 0.5],
              16, ["*", ["get", "sign"], halfWidth],
              18, ["*", ["get", "sign"], halfWidth * 1.3],
            ];
            map.addLayer({
              id: `${srcId}-halo`,
              type: "line",
              source: srcId,
              layout: { "line-join": "round", "line-cap": "round" },
              paint: {
                "line-color": "#ffffff",
                "line-width": r.mode === "TRAM" ? 7 : 5,
                "line-opacity": 0.85,
                "line-offset": offsetExpr,
              },
            }, beforeId);
            map.addLayer({
              id: srcId,
              type: "line",
              source: srcId,
              layout: { "line-join": "round", "line-cap": "round" },
              paint: {
                "line-color": hex(r.color),
                "line-width": r.mode === "TRAM" ? 4.5 : 3,
                "line-opacity": 0.95,
                "line-offset": offsetExpr,
              },
            }, beforeId);
            // Click → select line
            const onClick = () => dispatch({ type: "SELECT_ROUTE", id: r.id });
            map.on("click", srcId, onClick);
            map.on("mouseenter", srcId, () => (map.getCanvas().style.cursor = "pointer"));
            map.on("mouseleave", srcId, () => (map.getCanvas().style.cursor = ""));
          }
        } catch (e) { /* tolerated */ }
      }
    })();

    // Toggle visibility
    for (const r of state.routes) {
      const srcId = `line-${r.id}`;
      const layers = [srcId, `${srcId}-halo`];
      const show = visible.includes(r) &&
        (!state.selectedRouteId || state.selectedRouteId === r.id);
      for (const id of layers) {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, "visibility", show ? "visible" : "none");
        }
      }
    }
  }, [ready, state.routes, state.modeFilter, state.selectedRouteId, state.theme, dispatch]);

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
  }, [ready, state.theme, dispatch]);

  // Heatmap visibility follows store
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const id = "all-stops-heatmap";
    if (!map.getLayer(id)) return;
    map.setLayoutProperty(id, "visibility", state.showHeatmap ? "visible" : "none");
  }, [state.showHeatmap, ready]);

  // Parkings + P+R with live availability
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const srcId = "parkings";

    function ensureLayers() {
      if (!map) return;
      if (!map.getSource(srcId)) {
        map.addSource(srcId, { type: "geojson", data: { type: "FeatureCollection", features: [] } as any });
        map.addLayer({
          id: `${srcId}-halo`,
          type: "circle",
          source: srcId,
          minzoom: 11,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 6, 14, 11, 17, 16],
            "circle-color": "#ffffff",
            "circle-opacity": 0.95,
            "circle-stroke-color": [
              "case",
              ["==", ["get", "status"], "closed"], "#94a3b8",
              [">=", ["get", "ratio"], 0.5], "#0EAA68",
              [">=", ["get", "ratio"], 0.1], "#f97316",
              ["!=", ["get", "ratio"], null] as any, "#dc2626",
              "#64748b",
            ],
            "circle-stroke-width": 2.5,
          },
        });
        // "P" letter
        map.addLayer({
          id: `${srcId}-label`,
          type: "symbol",
          source: srcId,
          minzoom: 11,
          layout: {
            "text-field": ["case", ["get", "isPr"], "P+R", "P"],
            "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 11, 9, 14, 11, 17, 13],
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": [
              "case",
              ["==", ["get", "status"], "closed"], "#94a3b8",
              [">=", ["get", "ratio"], 0.5], "#0EAA68",
              [">=", ["get", "ratio"], 0.1], "#f97316",
              ["!=", ["get", "ratio"], null] as any, "#dc2626",
              "#64748b",
            ],
          },
        });
        map.on("click", `${srcId}-halo`, (e) => {
          const f = e.features?.[0]; if (!f) return;
          const p = f.properties as any;
          const free = p.free ?? "?";
          const total = p.total ?? "?";
          const freePr = p.freePr;
          const totalPr = p.totalPr;
          const statusLabel = p.status === "closed" ? "Fermé" : p.status === "unknown" ? "Données indisponibles" : `${free} / ${total} places`;
          const html = `
            <div style="font:600 13px var(--font-sans);color:#161a23;margin-bottom:4px">${escapeHtml(p.nom || "Parking")}</div>
            <div style="font:12px var(--font-sans);color:#565d6c;margin-bottom:6px">${escapeHtml(p.adresse || "")}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
              <div style="width:8px;height:8px;border-radius:999px;background:${p.status === 'closed' ? '#94a3b8' : p.ratio >= 0.5 ? '#0EAA68' : p.ratio >= 0.1 ? '#f97316' : '#dc2626'}"></div>
              <strong style="font:600 12px var(--font-sans)">${statusLabel}</strong>
            </div>
            ${totalPr > 0 && freePr != null ? `<div style="font:11px var(--font-sans);color:#565d6c">Dont P+R : ${freePr} / ${totalPr}</div>` : ""}
            ${p.gratuit ? '<div style="font:11px var(--font-sans);color:#0EAA68;margin-top:4px">✓ Gratuit</div>' : p.tarif_1h ? `<div style=\"font:11px var(--font-sans);color:#565d6c;margin-top:4px\">${p.tarif_1h}€ / 1h</div>` : ""}
          `;
          new maplibregl.Popup({ offset: 14, maxWidth: "280px" }).setLngLat(e.lngLat).setHTML(html).addTo(map!);
        });
        map.on("mouseenter", `${srcId}-halo`, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", `${srcId}-halo`, () => (map.getCanvas().style.cursor = ""));
      }
    }

    function escapeHtml(s: any): string {
      return String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]!));
    }

    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetch("/api/parkings").then((r) => r.json());
        if (cancelled || !map) return;
        ensureLayers();
        const src = map.getSource(srcId) as any;
        if (src?.setData) src.setData(data);
      } catch {}
    };
    load();
    const iv = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [ready, state.theme]);

  // POI layer (agences M réso + Métrovélo) — loaded once, kept on top
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (map.getSource("poi")) return;

    let cancelled = false;

    function drawMResoCircleLogo(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) {
      // Colorful ring made of segments inspired by the M tram lines + brand colors
      const segments = [
        "#FFB400", // jaune (D)
        "#E04E2A", // orange
        "#DC1271", // magenta M réso brand
        "#7350A2", // violet (E)
        "#3376B8", // bleu (A)
        "#0FA9D4", // cyan
        "#479A45", // vert (B)
        "#C20078", // rose foncé (C)
      ];
      const ringWidth = radius * 0.20;
      const ringR = radius - ringWidth / 2;
      const gap = 0.06; // small gap between segments
      const sliceAngle = (Math.PI * 2) / segments.length;
      for (let i = 0; i < segments.length; i++) {
        const start = -Math.PI / 2 + i * sliceAngle + gap / 2;
        const end = start + sliceAngle - gap;
        ctx.strokeStyle = segments[i];
        ctx.lineWidth = ringWidth;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, start, end);
        ctx.stroke();
      }
      // Inner black disc
      ctx.fillStyle = "#0b0d12";
      ctx.beginPath();
      ctx.arc(cx, cy, radius - ringWidth - 1, 0, Math.PI * 2);
      ctx.fill();
      // White M letter
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 ${Math.round(radius * 1.05)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("M", cx, cy + radius * 0.05);
    }

    function makeIcon(kind: "agence" | "metrovelo" | "service", logo?: HTMLImageElement): HTMLCanvasElement {
      const c = document.createElement("canvas");
      // Fixed 2x pixel ratio so addImage(pixelRatio:2) always matches
      c.width = 120; c.height = 120;
      const ctx = c.getContext("2d")!;
      ctx.scale(2, 2);

      if (kind === "agence") {
        // Circular M réso logo only — no surrounding pill
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,.28)";
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(30, 30, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        drawMResoCircleLogo(ctx, 30, 30, 20);
        return c;
      }

      // pill background for non-agence POI
      ctx.shadowColor = "rgba(0,0,0,.22)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      const bg = kind === "metrovelo" ? "#0EAA68" : "#1d4ed8";
      ctx.fillStyle = bg;
      const r = 12;
      roundRect(ctx, 8, 8, 44, 44, r);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = kind === "metrovelo" ? "#0b6b41" : "#1e3a8a";
      ctx.lineWidth = 2;
      roundRect(ctx, 8, 8, 44, 44, r);
      ctx.stroke();

      if (kind === "metrovelo") {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(20, 38, 6, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(40, 38, 6, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(20, 38); ctx.lineTo(28, 24); ctx.lineTo(40, 38);
        ctx.moveTo(28, 24); ctx.lineTo(36, 24);
        ctx.stroke();
      } else {
        // pointService: info "i"
        ctx.fillStyle = "#ffffff";
        ctx.font = "800 26px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("i", 30, 32);
      }
      return c;
    }
    function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }

    function canvasToImageData(c: HTMLCanvasElement): ImageData {
      const ctx = c.getContext("2d")!;
      return ctx.getImageData(0, 0, c.width, c.height);
    }

    function addLayers(fc: any, logo: HTMLImageElement | null) {
      if (cancelled || !map || map.getSource("poi")) return;

      const agenceIcon = makeIcon("agence", logo ?? undefined);
      const veloIcon = makeIcon("metrovelo");
      const serviceIcon = makeIcon("service");
      if (!map.hasImage("poi-agence")) map.addImage("poi-agence", canvasToImageData(agenceIcon), { pixelRatio: 2 });
      if (!map.hasImage("poi-velo")) map.addImage("poi-velo", canvasToImageData(veloIcon), { pixelRatio: 2 });
      if (!map.hasImage("poi-service")) map.addImage("poi-service", canvasToImageData(serviceIcon), { pixelRatio: 2 });

      map.addSource("poi", { type: "geojson", data: fc });

      // Métrovélo : visible at higher zoom only
      map.addLayer({
        id: "poi-velo-layer",
        type: "symbol",
        source: "poi",
        filter: ["==", ["get", "poiType"], "MVC"],
        minzoom: 13,
        layout: {
          "icon-image": "poi-velo",
          "icon-size": ["interpolate", ["linear"], ["zoom"], 13, 0.4, 16, 0.7],
          "icon-allow-overlap": false,
          "icon-ignore-placement": false,
        },
      });

      // Points Service
      map.addLayer({
        id: "poi-service-layer",
        type: "symbol",
        source: "poi",
        filter: ["==", ["get", "poiType"], "pointService"],
        minzoom: 12,
        layout: {
          "icon-image": "poi-service",
          "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.5, 16, 0.85],
          "icon-allow-overlap": true,
        },
      });

      // Agences M réso : always visible (priority POI)
      map.addLayer({
        id: "poi-agence-layer",
        type: "symbol",
        source: "poi",
        filter: ["==", ["get", "poiType"], "agenceM"],
        minzoom: 11,
        layout: {
          "icon-image": "poi-agence",
          "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.5, 14, 0.8, 17, 1],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "text-field": ["step", ["zoom"], "", 14, ["get", "NOM"]],
          "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
          "text-size": 11,
          "text-offset": [0, 2],
          "text-anchor": "top",
          "text-optional": true,
        },
        paint: {
          "text-color": "#161a23",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.4,
        },
      });

      const clickHandler = (e: any) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as any;
        const isAgence = p.poiType === "agenceM";
        const html = isAgence
          ? `<div style="font:600 13px var(--font-sans);color:#161a23;margin-bottom:4px">${escapeHtml(p.NOM || "Agence M")}</div>
             <div style="font:12px var(--font-sans);color:#565d6c">${escapeHtml(p.RUE || "")}<br>${escapeHtml(p.CODEPOSTAL || "")} ${escapeHtml(p.COMMUNE || "")}</div>
             ${p.TELEPHONE ? `<div style="font:12px var(--font-sans);color:#565d6c;margin-top:4px">☎ ${escapeHtml(p.TELEPHONE)}</div>` : ""}`
          : `<div style="font:600 13px var(--font-sans);color:#161a23">${escapeHtml(p.NOM || "Station Métrovélo")}</div>
             <div style="font:11px var(--font-sans);color:#565d6c">${escapeHtml(p.COMMUNE || "")}</div>`;
        new maplibregl.Popup({ offset: 18, closeButton: true, maxWidth: "280px" })
          .setLngLat(e.lngLat)
          .setHTML(html)
          .addTo(map);
      };
      const cursorPointer = () => (map.getCanvas().style.cursor = "pointer");
      const cursorReset = () => (map.getCanvas().style.cursor = "");
      for (const id of ["poi-agence-layer", "poi-velo-layer", "poi-service-layer"]) {
        map.on("click", id, clickHandler);
        map.on("mouseenter", id, cursorPointer);
        map.on("mouseleave", id, cursorReset);
      }
    }

    function escapeHtml(s: any): string {
      return String(s ?? "").replace(/[&<>"']/g, (m) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]!)
      );
    }

    // Load real M réso logo image, then build layers
    const logo = new Image();
    logo.crossOrigin = "anonymous";
    logo.src = "/poi/m-logo.png";

    Promise.all([
      fetch("/api/poi?types=agenceM,MVC,pointService").then((r) => r.json()),
      new Promise<HTMLImageElement | null>((resolve) => {
        if (logo.complete) resolve(logo);
        logo.onload = () => resolve(logo);
        logo.onerror = () => resolve(null);
      }),
    ]).then(([fc, img]) => { if (!cancelled) addLayers(fc, img); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [ready, state.theme]);

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
  }, [ready, state.selectedRouteId, state.theme, state.routes]);

  // Fit bounds when selecting a route
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !state.selectedRouteId) return;
    const cache: Map<string, LineGeometry> = (map as any).__geomCache ?? new Map();
    const data = cache.get(state.selectedRouteId);
    if (!data) return;
    const coords: [number, number][] = [];
    for (const f of data.features) {
      const c = f.geometry.coordinates as any;
      if (f.geometry.type === "MultiLineString") c.forEach((line: any) => line.forEach((p: any) => coords.push(p)));
      else c.forEach((p: any) => coords.push(p));
    }
    if (!coords.length) return;
    const lons = coords.map((p) => p[0]);
    const lats = coords.map((p) => p[1]);
    map.fitBounds(
      [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]] as LngLatBoundsLike,
      { padding: { top: 80, right: 80, bottom: 80, left: 460 }, duration: 700, maxZoom: 14 }
    );
  }, [state.selectedRouteId]);

  // Load stops of selected route
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const srcId = "selected-stops";
    if (!state.selectedRouteId) {
      if (map.getLayer(srcId)) map.removeLayer(srcId);
      if (map.getLayer(`${srcId}-label`)) map.removeLayer(`${srcId}-label`);
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
          map.addLayer({
            id: srcId,
            type: "circle",
            source: srcId,
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 3, 14, 5, 16, 7],
              "circle-color": "#ffffff",
              "circle-stroke-color": hex(route.color),
              "circle-stroke-width": 2.5,
              "circle-pitch-alignment": "map",
            },
          });
        }
        map.on("click", srcId, (e) => {
          const f = e.features?.[0];
          if (f) dispatch({ type: "SELECT_STOP", id: (f.properties as any).id });
        });
        map.on("mouseenter", srcId, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", srcId, () => (map.getCanvas().style.cursor = ""));
      });
  }, [ready, state.selectedRouteId, state.routes, state.theme, dispatch]);

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
  }, [ready, state.theme]);

  // Vehicle layer: HTML markers w/ smooth client-side interpolation between ticks.
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  // Per-vehicle animation state: from/to coords & timestamps for interpolation
  const animRef = useRef<Map<string, {
    fromLat: number; fromLon: number; fromBearing: number;
    toLat: number; toLon: number; toBearing: number;
    startTs: number; endTs: number;
  }>>(new Map());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !state.showVehicles) {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      animRef.current.clear();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const TICK_MS = 12_000;
    let stopped = false;

    async function tick() {
      // Visible routes following the current filter
      const targets: Route[] = state.selectedRouteId
        ? state.routes.filter((r) => r.id === state.selectedRouteId)
        : state.routes.filter((r) => {
            if (state.modeFilter === "TRAM") return r.mode === "TRAM";
            if (state.modeFilter === "BUS") return r.mode === "BUS";
            return true; // ALL
          });

      const all: Vehicle[] = [];
      const results = await Promise.allSettled(
        targets.map((r) => fetch(`/api/vehicles/${r.id}`).then((x) => x.json()))
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value?.vehicles) all.push(...r.value.vehicles);
      }

      // Update "occupied stops" GeoJSON: stops currently hosting a vehicle
      const occupiedFeatures: any[] = [];
      const seenStops = new Set<string>();
      for (const v of all) {
        if (!v.atStopId || seenStops.has(`${v.atStopId}|${v.routeId}`)) continue;
        seenStops.add(`${v.atStopId}|${v.routeId}`);
        occupiedFeatures.push({
          type: "Feature",
          properties: { stopId: v.atStopId, color: v.color, line: v.shortName },
          geometry: { type: "Point", coordinates: [v.lon, v.lat] },
        });
      }
      const occSrc = map!.getSource("occupied-stops") as any;
      if (occSrc?.setData) {
        occSrc.setData({ type: "FeatureCollection", features: occupiedFeatures });
      }

      const now = performance.now();
      const seen = new Set<string>();
      for (const v of all) {
        seen.add(v.tripId);
        const existing = markersRef.current.get(v.tripId);
        const prevAnim = animRef.current.get(v.tripId);
        const fromLat = prevAnim ? interpLat(prevAnim, now) : v.lat;
        const fromLon = prevAnim ? interpLon(prevAnim, now) : v.lon;
        const fromBearing = prevAnim ? interpBearing(prevAnim, now) : v.bearing;
        animRef.current.set(v.tripId, {
          fromLat, fromLon, fromBearing,
          toLat: v.lat, toLon: v.lon, toBearing: v.bearing,
          startTs: now,
          endTs: now + TICK_MS,
        });

        if (!existing) {
          const root = document.createElement("div");
          root.className = "m-vehicle";
          root.style.cssText = "transform-origin:center;will-change:transform;cursor:pointer;";
          const fg = readableOn(v.color);
          root.innerHTML = `
            <div class="vehicle-pulse" style="color:${v.color}">
              <div data-pill style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:999px;background:${v.color};color:${fg};font:700 11px/1 var(--font-sans);box-shadow:0 4px 10px rgba(0,0,0,.18),0 0 0 2px #fff;transition:transform 120ms ease-out;">
                ${v.shortName}
              </div>
            </div>`;
          root.addEventListener("click", (e) => {
            e.stopPropagation();
            dispatch({ type: "SELECT_ROUTE", id: v.routeId });
            dispatch({ type: "SELECT_VEHICLE", tripId: v.tripId });
          });
          const m = new maplibregl.Marker({ element: root, anchor: "center" })
            .setLngLat([fromLon, fromLat])
            .addTo(map!);
          markersRef.current.set(v.tripId, m);
        }
      }
      // Remove stale
      for (const [id, m] of markersRef.current) {
        if (!seen.has(id)) {
          m.remove();
          markersRef.current.delete(id);
          animRef.current.delete(id);
        }
      }
    }

    let lastFollow = 0;
    function loop() {
      const t = performance.now();
      let followLat: number | null = null, followLon: number | null = null;
      for (const [id, anim] of animRef.current) {
        const m = markersRef.current.get(id);
        if (!m) continue;
        const lat = interpLat(anim, t);
        const lon = interpLon(anim, t);
        m.setLngLat([lon, lat]);
        if (state.followVehicle && id === state.selectedVehicleTripId) {
          followLat = lat; followLon = lon;
        }
      }
      // Throttle follow-recentre to once every 600ms (smooth without fighting MapLibre)
      if (followLat !== null && followLon !== null && t - lastFollow > 600) {
        lastFollow = t;
        map!.easeTo({ center: [followLon, followLat], duration: 600, essential: true });
      }
      if (!stopped) rafRef.current = requestAnimationFrame(loop);
    }

    tick();
    const iv = setInterval(() => { if (!stopped) tick(); }, TICK_MS);
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      clearInterval(iv);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [ready, state.selectedRouteId, state.routes, state.modeFilter, state.showVehicles]);

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
