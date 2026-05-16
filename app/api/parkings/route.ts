import { NextResponse } from "next/server";
import { upstream } from "@/lib/api";

export const revalidate = 30;
export const dynamic = "force-dynamic";

const BBOX = { xmin: 5.5, xmax: 5.95, ymin: 45.05, ymax: 45.4 };

interface DynRecord {
  time: number;
  nb_places_libres: number | null;
  nb_parking_libres: number | null;
  nb_pr_libres: number | null;
  nsv_id: number;
}

export async function GET() {
  const [staticData, dynData] = await Promise.all([
    upstream<any>(
      `/api/bbox/json?xmin=${BBOX.xmin}&xmax=${BBOX.xmax}&ymin=${BBOX.ymin}&ymax=${BBOX.ymax}&types=parking`,
      { revalidate: 3600 }
    ),
    upstream<Record<string, DynRecord>>("/api/dyn/parking/json", { revalidate: 30 }).catch(
      () => ({}) as Record<string, DynRecord>
    ),
  ]);

  const features = (staticData.features || []).map((f: any) => {
    const live = dynData[f.properties.id];
    const total = f.properties.nb_places ?? 0;
    const totalPr = f.properties.nb_pr ?? 0;
    const free = live?.nb_places_libres ?? null;
    const freePr = live?.nb_pr_libres ?? null;
    let status: "open" | "closed" | "unknown" = "unknown";
    let ratio: number | null = null;
    if (free != null && total > 0) {
      ratio = free / total;
      status = "open";
    } else if (live?.nb_places_libres === null && live?.time) {
      status = "closed";
    }
    return {
      type: "Feature" as const,
      properties: {
        ...f.properties,
        free,
        freePr,
        total,
        totalPr,
        ratio,
        status,
        updatedAt: live?.time ?? null,
        isPr: totalPr > 0,
      },
      geometry: f.geometry,
    };
  });

  return NextResponse.json(
    { type: "FeatureCollection", features },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } }
  );
}
