"use client";
import { useEffect, useRef } from "react";
import { useApp } from "@/lib/store";

/**
 * Two-way sync between app state and the URL query string.
 * Keys: r (routeId), s (stopId), v (vehicleTripId), q (search), t (theme), h (heatmap)
 */
export function UrlSync() {
  const { state, dispatch } = useApp();
  const restoredRef = useRef(false);

  // ---- read URL on mount, after routes are loaded so SELECT_ROUTE is valid
  useEffect(() => {
    if (restoredRef.current) return;
    if (state.routes.length === 0) return;
    restoredRef.current = true;
    const p = new URLSearchParams(window.location.search);
    const r = p.get("r");
    const s = p.get("s");
    const v = p.get("v");
    const q = p.get("q");
    const t = p.get("t");
    const h = p.get("h");
    if (r && state.routes.find((x) => x.id === r)) dispatch({ type: "SELECT_ROUTE", id: r });
    if (s) dispatch({ type: "SELECT_STOP", id: s });
    if (v) dispatch({ type: "SELECT_VEHICLE", tripId: v });
    if (q) dispatch({ type: "SET_QUERY", query: q });
    if (t === "dark" || t === "light") dispatch({ type: "SET_THEME", theme: t });
    if (h === "1" && !state.showHeatmap) dispatch({ type: "TOGGLE_HEATMAP" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.routes.length]);

  // ---- write URL when relevant state changes
  useEffect(() => {
    if (!restoredRef.current) return;
    const params = new URLSearchParams();
    if (state.selectedRouteId) params.set("r", state.selectedRouteId);
    if (state.selectedStopId) params.set("s", state.selectedStopId);
    if (state.selectedVehicleTripId) params.set("v", state.selectedVehicleTripId);
    if (state.query) params.set("q", state.query);
    if (state.theme === "dark") params.set("t", "dark");
    if (state.showHeatmap) params.set("h", "1");
    const search = params.toString();
    const url = `${window.location.pathname}${search ? `?${search}` : ""}`;
    if (url !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", url);
    }
  }, [
    state.selectedRouteId,
    state.selectedStopId,
    state.selectedVehicleTripId,
    state.query,
    state.theme,
    state.showHeatmap,
  ]);

  return null;
}
