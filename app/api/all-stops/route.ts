import { NextResponse } from "next/server";
import { upstream } from "@/lib/api";
import type { Route, Stop } from "@/lib/types";

export const revalidate = 3600;
export const dynamic = "force-dynamic";

/**
 * Aggregate stops of every TAG route, de-duplicated by `cluster`
 * so each physical location appears once with the union of lines serving it.
 */
export async function GET() {
  const routes = await upstream<Route[]>("/api/routers/default/index/routes", {
    revalidate: 86400,
  });
  const tagRoutes = routes.filter((r) => r.id.startsWith("SEM:"));

  const all = await Promise.allSettled(
    tagRoutes.map(async (r) => {
      const stops = await upstream<Stop[]>(
        `/api/routers/default/index/routes/${encodeURIComponent(r.id)}/stops`,
        { revalidate: 86400 }
      );
      return { route: r, stops };
    })
  );

  // Map cluster -> aggregated stop
  type Agg = Stop & { lines: { id: string; shortName: string; color: string; mode: string }[] };
  const byCluster = new Map<string, Agg>();

  for (const result of all) {
    if (result.status !== "fulfilled") continue;
    const { route, stops } = result.value;
    for (const s of stops) {
      const key = s.cluster || s.gtfsId;
      const existing = byCluster.get(key);
      const lineRef = {
        id: route.id,
        shortName: route.shortName,
        color: route.color,
        mode: route.mode,
      };
      if (existing) {
        if (!existing.lines.some((l) => l.id === route.id)) existing.lines.push(lineRef);
      } else {
        byCluster.set(key, { ...s, lines: [lineRef] });
      }
    }
  }

  // GeoJSON output for direct use as map source
  const features = Array.from(byCluster.values()).map((s) => ({
    type: "Feature" as const,
    properties: {
      id: s.gtfsId,
      name: s.name,
      city: s.city || "",
      hasTram: s.lines.some((l) => l.mode === "TRAM"),
      linesCount: s.lines.length,
      lines: s.lines.map((l) => l.shortName).join(","),
    },
    geometry: { type: "Point" as const, coordinates: [s.lon, s.lat] },
  }));

  return NextResponse.json(
    { type: "FeatureCollection", features },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
}
