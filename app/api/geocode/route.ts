import { NextResponse } from "next/server";
import { upstream } from "@/lib/api";

export const revalidate = 300;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const qRaw = (searchParams.get("q") ?? "").trim();
  if (!qRaw) return NextResponse.json({ error: "invalid q" }, { status: 400 });
  if (qRaw.length > 100) return NextResponse.json({ error: "invalid q" }, { status: 400 });
  const cleaned = qRaw.replace(/[^\p{L}\p{N}\s\-]/gu, " ").trim();
  if (cleaned.length < 2) return NextResponse.json({ features: [] });
  const types = "arret,pointArret,lieux,depositaire";
  let data: any = { features: [] };
  try {
    data = await upstream<any>(
      `/api/findType/json?query=${encodeURIComponent(cleaned)}&types=${types}`,
      { revalidate: 300 }
    );
  } catch {
    return NextResponse.json({ features: [] });
  }
  // limit to 8 results, prefer arret/pointArret
  const features = (data.features || []).slice(0, 8);
  return NextResponse.json({ features }, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}
