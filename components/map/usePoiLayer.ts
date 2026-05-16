"use client";
import { useEffect, RefObject } from "react";
import maplibregl, { Map as MLMap } from "maplibre-gl";

type Theme = "light" | "dark";

export function usePoiLayer(params: {
  mapRef: RefObject<MLMap | null>;
  theme: Theme;
  ready: boolean;
}) {
  const { mapRef, theme, ready } = params;
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
  }, [ready, theme, mapRef]);
}
