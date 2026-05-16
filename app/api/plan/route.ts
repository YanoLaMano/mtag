import { NextResponse } from "next/server";
import { upstream } from "@/lib/api";

export const revalidate = 30;
export const dynamic = "force-dynamic";

const LAT_OK = (v: number) => Number.isFinite(v) && v >= 44.5 && v <= 45.7;
const LON_OK = (v: number) => Number.isFinite(v) && v >= 5.0 && v <= 6.5;
function validLatLonPair(s: string): boolean {
  if (!s) return false;
  const parts = s.split(",");
  if (parts.length !== 2) return false;
  const lat = parseFloat(parts[0]);
  const lon = parseFloat(parts[1]);
  return LAT_OK(lat) && LON_OK(lon);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  if (!validLatLonPair(from)) {
    return NextResponse.json({ error: "invalid from" }, { status: 400 });
  }
  if (!validLatLonPair(to)) {
    return NextResponse.json({ error: "invalid to" }, { status: 400 });
  }
  const mode = searchParams.get("mode") ?? "TRANSIT,WALK";
  const numItineraries = searchParams.get("n") ?? "3";
  const date = searchParams.get("date");
  const time = searchParams.get("time");

  const params = new URLSearchParams({
    fromPlace: from,
    toPlace: to,
    mode,
    numItineraries,
    walkReluctance: "2",
    arriveBy: "false",
    showIntermediateStops: "true",
    locale: "fr",
  });
  if (date) params.set("date", date);
  if (time) params.set("time", time);

  const data = await upstream(`/api/routers/default/plan?${params.toString()}`, {
    revalidate: 30,
  });
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
  });
}
