import { NextResponse } from "next/server";
import { upstream } from "@/lib/api";

export const revalidate = 300;
export const dynamic = "force-dynamic";

/**
 * Compute reachable stops within X minutes from a (lat,lon) using
 * the lightweight OTP "lines near point" + flood-fill via consecutive
 * stops/stoptimes. Returns a GeoJSON FeatureCollection of reachable stops
 * coloured by minutes-to-reach.
 *
 * Strategy:
 *  1. Use /api/linesNear to find lines near origin
 *  2. For each line, fetch its stops and compute walking distance
 *     from origin to nearest stop (haversine).
 *  3. Reachable in T = walkTime(origin→stop) + dwell + average travel along line
 *     up to the maxMinutes budget.
 *
 * This is a *lightweight* isochrone (not exact OTP plan), good enough for
 * a visual overview.
 */
function hav(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(toRad(a[1])) * Math.cos(toRad(b[1]));
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

const LAT_OK = (v: number) => Number.isFinite(v) && v >= 44.5 && v <= 45.7;
const LON_OK = (v: number) => Number.isFinite(v) && v >= 5.0 && v <= 6.5;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lon = parseFloat(searchParams.get("lon") ?? "");
  if (!LAT_OK(lat)) {
    return NextResponse.json({ error: "invalid lat" }, { status: 400 });
  }
  if (!LON_OK(lon)) {
    return NextResponse.json({ error: "invalid lon" }, { status: 400 });
  }
  const maxMin = Math.min(60, Math.max(5, parseInt(searchParams.get("max") ?? "20", 10)));

  // 1. lines near origin (1.5 km radius)
  const nearby = await upstream<any[]>(
    `/api/linesNear/json?x=${lon}&y=${lat}&dist=1500`,
    { revalidate: 300 }
  ).catch(() => []);
  const lineIds: string[] = Array.from(
    new Set(nearby.map((n: any) => n.id || n.gtfsId).filter(Boolean))
  ).slice(0, 8);

  // 2. fetch stops of those lines
  const stopsPerLine = await Promise.all(
    lineIds.map((id) =>
      upstream<any[]>(`/api/routers/default/index/routes/${encodeURIComponent(id)}/stops`, { revalidate: 3600 })
        .then((s) => ({ id, stops: s }))
        .catch(() => ({ id, stops: [] as any[] }))
    )
  );

  const WALK_MPS = 1.3;
  const TRANSIT_MPS = 6.5;
  const DWELL_S = 30;

  // 3. compute reach time per stop
  const reached = new Map<string, { stop: any; minutes: number }>();
  for (const { stops } of stopsPerLine) {
    if (!stops.length) continue;
    // find nearest stop to origin on this line
    let best: { idx: number; d: number } | null = null;
    for (let i = 0; i < stops.length; i++) {
      const d = hav([lon, lat], [stops[i].lon, stops[i].lat]);
      if (!best || d < best.d) best = { idx: i, d };
    }
    if (!best) continue;
    const walkS = best.d / WALK_MPS;
    if (walkS / 60 > maxMin) continue;

    // sweep forward and backward along the stop list
    for (let dir = -1; dir <= 1; dir += 2) {
      let i = best.idx;
      let dist = 0;
      let i2 = i;
      while (true) {
        i2 = i + dir;
        if (i2 < 0 || i2 >= stops.length) break;
        dist += hav([stops[i].lon, stops[i].lat], [stops[i2].lon, stops[i2].lat]);
        const travelS = dist / TRANSIT_MPS;
        const dwellS = Math.abs(i2 - best.idx) * DWELL_S;
        const total = walkS + travelS + dwellS;
        if (total / 60 > maxMin) break;
        const prev = reached.get(stops[i2].gtfsId);
        const mins = total / 60;
        if (!prev || prev.minutes > mins) reached.set(stops[i2].gtfsId, { stop: stops[i2], minutes: mins });
        i = i2;
      }
    }
    // also the boarding stop
    const mins = walkS / 60;
    const prev = reached.get(stops[best.idx].gtfsId);
    if (!prev || prev.minutes > mins) reached.set(stops[best.idx].gtfsId, { stop: stops[best.idx], minutes: mins });
  }

  const features = Array.from(reached.values()).map((r) => ({
    type: "Feature" as const,
    properties: {
      id: r.stop.gtfsId,
      name: r.stop.name,
      minutes: Math.round(r.minutes),
    },
    geometry: { type: "Point" as const, coordinates: [r.stop.lon, r.stop.lat] },
  }));

  return NextResponse.json(
    { type: "FeatureCollection", features, origin: [lon, lat], maxMin },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
  );
}
