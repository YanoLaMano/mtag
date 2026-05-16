import { NextResponse } from "next/server";
import { upstream } from "@/lib/api";

export const revalidate = 3600;
export const dynamic = "force-dynamic";

// Grenoble metro bounding box
const BBOX = { xmin: 5.5, xmax: 5.95, ymin: 45.05, ymax: 45.4 };

const POI_TYPE_RE = /^[A-Za-z0-9_-]{1,40}$/;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const typesRaw = (searchParams.get("types") ?? "agenceM,MVC").trim();
  if (!typesRaw || typesRaw.length > 100) {
    return NextResponse.json({ error: "invalid types" }, { status: 400 });
  }
  const types = typesRaw.split(",").map((t) => t.trim()).filter(Boolean);
  if (!types.length || !types.every((t) => POI_TYPE_RE.test(t))) {
    return NextResponse.json({ error: "invalid types" }, { status: 400 });
  }

  const results = await Promise.allSettled(
    types.map((t) =>
      upstream<any>(
        `/api/bbox/json?xmin=${BBOX.xmin}&xmax=${BBOX.xmax}&ymin=${BBOX.ymin}&ymax=${BBOX.ymax}&types=${encodeURIComponent(t)}`,
        { revalidate: 3600 }
      ).then((data) => ({ type: t, data }))
    )
  );

  const features: any[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value.data?.features) continue;
    for (const f of r.value.data.features) {
      features.push({
        type: "Feature",
        properties: {
          ...f.properties,
          poiType: r.value.type,
        },
        geometry: f.geometry,
      });
    }
  }

  return NextResponse.json(
    { type: "FeatureCollection", features },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } }
  );
}
