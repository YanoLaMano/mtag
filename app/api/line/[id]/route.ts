import { NextResponse } from "next/server";
import { upstream } from "@/lib/api";
import type { LineGeometry } from "@/lib/types";

export const revalidate = 86400;
export const dynamic = "force-dynamic";

const LINE_ID_RE = /^[A-Z0-9:_-]{1,80}$/;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!LINE_ID_RE.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  // SEM:A -> SEM_A
  const code = id.replace(":", "_");
  const data = await upstream<LineGeometry>(
    `/api/lines/json?types=ligne&codes=${encodeURIComponent(code)}`,
    { revalidate: 86400 }
  );
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
