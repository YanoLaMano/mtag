import { NextResponse } from "next/server";
import { upstream } from "@/lib/api";
import { buildVehicles } from "@/lib/interpolate";
import type { Route, Stop, StopTimePattern, LineGeometry } from "@/lib/types";

export const revalidate = 60;
export const dynamic = "force-dynamic";

const ROUTE_ID_RE = /^[A-Z]{3,4}:[A-Z0-9_-]+$/;

/**
 * Vehicle positions for a route at an ARBITRARY seconds-since-midnight value.
 * Uses the same path-aware interpolation as /api/vehicles but lets the client
 * scrub through time (e.g. "where were trams at 8h12 this morning ?").
 *
 * NOTE: this uses TODAY's stoptimes (real-time + theoretical) so it works best
 * for past times within the current service day.
 */
export async function GET(req: Request, { params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await params;
  if (!ROUTE_ID_RE.test(routeId)) {
    return NextResponse.json({ error: "invalid routeId" }, { status: 400 });
  }
  const { searchParams } = new URL(req.url);
  const sec = parseInt(searchParams.get("at") ?? "0", 10);

  const [routes, stops, geometry] = await Promise.all([
    upstream<Route[]>("/api/routers/default/index/routes", { revalidate: 3600 }),
    upstream<Stop[]>(
      `/api/routers/default/index/routes/${encodeURIComponent(routeId)}/stops`,
      { revalidate: 3600 }
    ),
    upstream<LineGeometry>(
      `/api/lines/json?types=ligne&codes=${encodeURIComponent(routeId.replace(":", "_"))}`,
      { revalidate: 86400 }
    ).catch(() => null),
  ]);

  const route = routes.find((r) => r.id === routeId);
  if (!route) return NextResponse.json({ error: "Unknown route" }, { status: 404 });

  const uniq = Array.from(new Map(stops.map((s) => [s.gtfsId, s])).values());
  const results = await Promise.allSettled(
    uniq.map((s) =>
      upstream<StopTimePattern[]>(
        `/api/routers/default/index/stops/${encodeURIComponent(s.gtfsId)}/stoptimes`,
        { revalidate: 60 }
      ).then((d) => [s.gtfsId, d] as const)
    )
  );

  const patternsByStop: Record<string, StopTimePattern[]> = {};
  for (const r of results) {
    if (r.status === "fulfilled") {
      const [stopId, data] = r.value;
      const filtered = data.filter((p) => p.pattern.id.startsWith(`${routeId}:`));
      if (filtered.length) patternsByStop[stopId] = filtered;
    }
  }

  const vehicles = buildVehicles(route, uniq, patternsByStop, sec, geometry as any);
  return NextResponse.json({ vehicles, at: sec, ts: Date.now() }, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
