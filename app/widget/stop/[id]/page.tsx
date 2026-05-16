import "../../../globals.css";
import { upstream } from "@/lib/api";
import type { StopTimePattern, Route } from "@/lib/types";
import { WidgetClient } from "./WidgetClient";

export const dynamic = "force-dynamic";
export const revalidate = 15;

export default async function WidgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, routes] = await Promise.all([
    upstream<StopTimePattern[]>(`/api/routers/default/index/stops/${encodeURIComponent(id)}/stoptimes`, { revalidate: 15 }).catch(() => []),
    upstream<Route[]>("/api/routers/default/index/routes", { revalidate: 3600 }).catch(() => []),
  ]);

  const name = data?.[0]?.times?.[0]?.stopName ?? id;

  return <WidgetClient stopId={id} stopName={name} initial={data || []} routes={routes || []} />;
}
