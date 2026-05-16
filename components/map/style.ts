export const GRENOBLE: [number, number] = [5.7245, 45.1885];

export const STYLE_URL =
  "https://api.maptiler.com/maps/dataviz-light/style.json?key=get_your_own_OpIi9ZULNHzrESv6T2vL";

// Fallback OSM raster style so it works without any key.
export function makeStyle(theme: "light" | "dark") {
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
export const FALLBACK_STYLE = makeStyle("light");
