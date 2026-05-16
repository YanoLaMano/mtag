import { NextResponse } from "next/server";
import { upstream } from "@/lib/api";
import type { StopTimePattern } from "@/lib/types";

export const revalidate = 15;
export const dynamic = "force-dynamic";

const STOP_ID_RE = /^[A-Z0-9:_-]{1,80}$/;

export async function GET(_: Request, { params }: { params: Promise<{ stopId: string }> }) {
  const { stopId } = await params;
  if (!STOP_ID_RE.test(stopId)) {
    return NextResponse.json({ error: "invalid stopId" }, { status: 400 });
  }
  const data = await upstream<StopTimePattern[]>(
    `/api/routers/default/index/stops/${encodeURIComponent(stopId)}/stoptimes`,
    { revalidate: 15 }
  );
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" },
  });
}
