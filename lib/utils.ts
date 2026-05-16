import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Vehicle } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function hex(color: string) {
  return color.startsWith("#") ? color : `#${color}`;
}

/** Pick foreground (white/dark) for best contrast on a given hex bg. */
export function readableOn(bg: string): string {
  const c = bg.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return l > 0.6 ? "#0b0d12" : "#ffffff";
}

export function formatRelativeTime(secondsFromNow: number): string {
  if (secondsFromNow <= 30) return "à l'approche";
  if (secondsFromNow < 60) return `${secondsFromNow}s`;
  const m = Math.round(secondsFromNow / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h${(m % 60).toString().padStart(2, "0")}`;
}

/**
 * Trip-wide progress in [0, 1] — fraction of the *whole journey* the vehicle
 * has covered, from its starting terminus to its arrival terminus. Computed
 * by stop count: (passedStops + currentSegmentProgress) / totalStops. The
 * server's `vehicle.progress` is local to the current segment (0→1 between
 * each consecutive pair of stops) which oscillates and reads weirdly when
 * shown as "% du trajet" — this version is monotonic.
 *
 * Pass current Paris seconds-since-midnight; the segment portion ticks live
 * even between server polls.
 */
export function tripProgress(v: Vehicle, nowSec: number): number {
  if (!v.tripStops || v.tripStops.length === 0) return v.progress;
  const total = v.tripStops.length;
  // Reached = stops the vehicle is past (passed=true) plus the stop it's
  // currently dwelling at (isAtStop=true). interpolate.ts sets passed only
  // when !isAtStop, so the dwelled stop is counted here exactly once.
  const reached = v.tripStops.filter((s) => s.passed || s.isAtStop).length;
  // While dwelling, no extra segment progress — pin to the stop count.
  if (v.tripStops.some((s) => s.isAtStop)) return reached / total;
  // Between stops: add the live segment fraction so the bar advances each
  // second instead of stepping by 1/total every couple of minutes.
  if (!v.prevStopId || !v.nextStopId) return reached / total;
  const prev = v.tripStops.find((s) => s.stopId === v.prevStopId);
  const next = v.tripStops.find((s) => s.stopId === v.nextStopId);
  if (!prev || !next) return reached / total;
  const span = next.arrive - prev.depart;
  if (span <= 0) return reached / total;
  const seg = Math.max(0, Math.min(1, (nowSec - prev.depart) / span));
  return Math.min(1, (reached + seg) / total);
}

/**
 * Seconds since midnight in Europe/Paris (matches the upstream API's
 * serviceDay + seconds-since-midnight convention).
 *
 * The previous implementation used `new Date().getHours()` which returns
 * the *runtime's* local time. That's only correct when the runtime is
 * actually in Paris time. On Vercel/Fly/AWS the runtime is UTC, so the
 * computed `nowSec` was 1-2 h off, and every vehicle's prev/next/dwell
 * classification in interpolate.ts was misaligned with the realtime data
 * — which manifests as vehicles displayed 1-2 stops behind their real
 * position. Use Intl with an explicit timeZone to force Paris time on
 * both server and client (the Grenoble client is already in CET, but
 * being explicit keeps the API symmetric).
 */
export function nowSecondsSinceMidnight(): number {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
  return get("hour") * 3600 + get("minute") * 60 + get("second");
}
