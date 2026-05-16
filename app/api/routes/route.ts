import { NextResponse } from "next/server";
import { upstream } from "@/lib/api";
import type { Route } from "@/lib/types";

export const revalidate = 3600;

export async function GET() {
  const data = await upstream<Route[]>("/api/routers/default/index/routes", {
    revalidate: 3600,
  });
  // Keep TAG network (SEM = Service Express Métropolitain / TAG)
  const tag = data.filter((r) => r.id.startsWith("SEM:"));
  return NextResponse.json(tag, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
