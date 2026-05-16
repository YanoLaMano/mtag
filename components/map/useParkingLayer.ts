"use client";
import { useEffect, RefObject } from "react";
import maplibregl, { Map as MLMap } from "maplibre-gl";

type Theme = "light" | "dark";

export function useParkingLayer(params: {
  mapRef: RefObject<MLMap | null>;
  theme: Theme;
  ready: boolean;
}) {
  const { mapRef, theme, ready } = params;
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
  }, [ready, theme, mapRef]);
}
