import { NextResponse } from "next/server";
import { fetchVehiclesSnapshot, fetchVehiclePatterns } from "@/lib/api";
import { buildVehicles } from "@/lib/interpolate";
import { nowSecondsSinceMidnight } from "@/lib/utils";

export const revalidate = 0; // always fresh
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await params;

  let snapshot;
  try {
    snapshot = await fetchVehiclesSnapshot(routeId);
  } catch (e) {
    if ((e as Error).message === "Invalid routeId") {
      return NextResponse.json({ error: "invalid routeId" }, { status: 400 });
    }
    throw e;
  }
  if (!snapshot) return NextResponse.json({ error: "Unknown route" }, { status: 404 });

  // 8 s mirrors the SSE tick — keeps the snapshot route's freshness aligned
  // with the streaming route and well under the client's 12 s poll cadence.
  const patternsByStop = await fetchVehiclePatterns(routeId, snapshot.stops, 8);
  const vehicles = buildVehicles(
    snapshot.route,
    snapshot.stops,
    patternsByStop,
    nowSecondsSinceMidnight(),
    snapshot.geometry
  );
  return NextResponse.json(
    { vehicles, ts: Date.now() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
