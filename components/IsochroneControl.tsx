"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { Hexagon, X, Locate } from "lucide-react";
import { cn } from "@/lib/utils";

export function IsochroneControl() {
  const [open, setOpen] = useState(false);
  const [maxMin, setMaxMin] = useState(20);
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [picking, setPicking] = useState(false);
  const sourceAdded = useRef(false);

  // listen for cmd palette trigger
  useEffect(() => {
    const onT = () => setOpen((o) => !o);
    window.addEventListener("m-isochrone-toggle", onT);
    return () => window.removeEventListener("m-isochrone-toggle", onT);
  }, []);

  // map click to pick origin
  useEffect(() => {
    const map: any = (window as any).__mMap;
    if (!map || !picking) return;
    map.getCanvas().style.cursor = "crosshair";
    const onClick = (e: any) => {
      setOrigin([e.lngLat.lng, e.lngLat.lat]);
      setPicking(false);
      map.getCanvas().style.cursor = "";
    };
    // Use .on (not .once) + explicit .off in cleanup. With .once the listener
    // stays registered if the user cancels picking without clicking the map,
    // and fires on the next unrelated click — silently setting a wrong origin.
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
      map.getCanvas().style.cursor = "";
    };
  }, [picking]);

  // recompute when origin/max change
  useEffect(() => {
    const map: any = (window as any).__mMap;
    if (!map || !origin) return;
    let cancel = false;

    fetch(`/api/isochrone?lat=${origin[1]}&lon=${origin[0]}&max=${maxMin}`)
      .then((r) => r.json())
      .then((fc) => {
        if (cancel || !map) return;
        const srcId = "isochrone";
        if (map.getSource(srcId)) {
          (map.getSource(srcId) as any).setData(fc);
        } else {
          map.addSource(srcId, { type: "geojson", data: fc });
          map.addLayer({
            id: `${srcId}-fill`,
            type: "circle",
            source: srcId,
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 14, 16, 48],
              "circle-color": [
                "interpolate", ["linear"], ["get", "minutes"],
                0,  "#0EAA68",
                10, "#82BD3B",
                20, "#F8B219",
                30, "#E04E2A",
                45, "#7350A2",
              ],
              "circle-opacity": 0.32,
              "circle-blur": 0.6,
            },
          });
          map.addLayer({
            id: `${srcId}-dot`,
            type: "circle",
            source: srcId,
            minzoom: 12,
            paint: {
              "circle-radius": 3.5,
              "circle-color": [
                "interpolate", ["linear"], ["get", "minutes"],
                0,  "#0b6b41",
                15, "#a78318",
                30, "#a23816",
              ],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1.5,
            },
          });
          map.addLayer({
            id: `${srcId}-label`,
            type: "symbol",
            source: srcId,
            minzoom: 13,
            layout: {
              "text-field": ["concat", ["to-string", ["get", "minutes"]], " min"],
              "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
              "text-size": 10,
              "text-offset": [0, 1.0],
              "text-anchor": "top",
              "text-optional": true,
            },
            paint: { "text-color": "#161a23", "text-halo-color": "#ffffff", "text-halo-width": 1.4 },
          });
          sourceAdded.current = true;
        }

        // Origin marker
        const ORIGIN_LAYER = "isochrone-origin";
        if (map.getSource(ORIGIN_LAYER)) {
          (map.getSource(ORIGIN_LAYER) as any).setData({
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: origin },
          });
        } else {
          map.addSource(ORIGIN_LAYER, {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: origin } },
          });
          map.addLayer({
            id: ORIGIN_LAYER,
            type: "circle",
            source: ORIGIN_LAYER,
            paint: {
              "circle-radius": 7,
              "circle-color": "#dc1271",
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 3,
            },
          });
        }
      })
      .catch(() => {});

    return () => { cancel = true; };
  }, [origin, maxMin]);

  // close cleanup
  useEffect(() => {
    if (open) return;
    const map: any = (window as any).__mMap;
    if (!map) return;
    for (const id of ["isochrone-fill", "isochrone-dot", "isochrone-label", "isochrone-origin"]) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    for (const id of ["isochrone", "isochrone-origin"]) {
      if (map.getSource(id)) map.removeSource(id);
    }
    setOrigin(null);
    sourceAdded.current = false;
  }, [open]);

  const findMe = () => {
    navigator.geolocation?.getCurrentPosition((p) => setOrigin([p.coords.longitude, p.coords.latitude]));
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute bottom-32 right-4 z-30 h-12 w-12 rounded-2xl glass-strong text-accent magnetic ripple inline-flex items-center justify-center group"
        aria-label="Isochrone"
        title="Vue isochrone"
      >
        <Hexagon size={17} className="group-hover:rotate-12 transition-transform" />
      </button>
    );
  }
  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-32 z-30 w-[min(420px,calc(100vw-32px))] animate-fade-up">
      <div className="glass-strong rounded-2xl p-3.5 flex flex-col gap-2.5">
        <header className="flex items-center justify-between">
          <h3 className="text-headline flex items-center gap-2"><Hexagon size={14} className="text-accent" /> Vue isochrone</h3>
          <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-surface" aria-label="Fermer"><X size={14} /></button>
        </header>
        <p className="text-caption">Où peux-tu aller en <strong className="text-fg tabular">{maxMin} min</strong> depuis un point ?</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPicking(true)}
            className={cn(
              "h-9 px-3 rounded-lg text-body inline-flex items-center gap-1.5 transition-colors",
              picking ? "bg-accent text-accent-fg" : "bg-surface text-fg hover:bg-border"
            )}
          >
            {picking ? "Clique sur la carte…" : (origin ? "Repositionner" : "Choisir un point")}
          </button>
          <button
            type="button"
            onClick={findMe}
            className="h-9 px-3 rounded-lg bg-surface text-fg hover:bg-border inline-flex items-center gap-1.5 text-body"
          >
            <Locate size={13} /> Moi
          </button>
        </div>
        <label className="flex items-center gap-2">
          <input
            type="range"
            min={5}
            max={45}
            step={1}
            value={maxMin}
            onChange={(e) => setMaxMin(parseInt(e.target.value, 10))}
            className="flex-1 accent-accent"
          />
          <span className="text-caption tabular w-16 text-right">{maxMin} min</span>
        </label>
      </div>
    </div>
  );
}
