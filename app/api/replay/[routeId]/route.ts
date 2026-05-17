import { NextResponse } from "next/server";
import { fetchVehiclesSnapshot, fetchVehiclePatterns } from "@/lib/api";
import { buildVehicles } from "@/lib/interpolate";

export const revalidate = 60;
export const dynamic = "force-dynamic";

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

  let snap;
  try {
    snap = await fetchVehiclesSnapshot(routeId);
  } catch (e) {
    if ((e as Error)?.message === "Invalid routeId") {
      return NextResponse.json({ error: "invalid routeId" }, { status: 400 });
    }
    throw e; // Let Next handle as 500
  }
  if (!snap) return NextResponse.json({ error: "Unknown route" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const rawAt = parseInt(searchParams.get("at") ?? "0", 10);
  const at = Number.isFinite(rawAt) ? Math.max(0, Math.min(172799, rawAt)) : 0;

  const patternsByStop = await fetchVehiclePatterns(routeId, snap.stops, 60);
  const vehicles = buildVehicles(snap.route, snap.stops, patternsByStop, at, snap.geometry);

  return NextResponse.json(
    { vehicles, at, ts: Date.now() },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
  );
}
