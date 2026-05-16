import { NextResponse } from "next/server";
import { upstream } from "@/lib/api";
import type { Stop } from "@/lib/types";

export const revalidate = 3600;
export const dynamic = "force-dynamic";

const ROUTE_ID_RE = /^[A-Z]{3,4}:[A-Z0-9_-]+$/;

export async function GET(_: Request, { params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await params;
  if (!ROUTE_ID_RE.test(routeId)) {
    return NextResponse.json({ error: "invalid routeId" }, { status: 400 });
  }
  const data = await upstream<Stop[]>(
    `/api/routers/default/index/routes/${encodeURIComponent(routeId)}/stops`,
    { revalidate: 3600 }
  );
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
