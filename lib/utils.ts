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
 * Trip-wide progress in [0, 1] — fraction of *stops reached* over the total
 * trip. Step-wise: the value changes only when the vehicle crosses an arrêt,
 * not continuously between stops. With N stops the bar advances by exactly
 * 1/N each time a stop is reached, so "5/12 stops done" reads as 41.7 %
 * and stays there until the 6th stop is reached.
 *
 * Reached = stops the vehicle is past (passed=true) plus the stop it is
 * currently dwelling at (isAtStop=true). interpolate.ts sets `passed` only
 * when `!isAtStop`, so the dwelled stop is counted here exactly once.
 *
 * The `nowSec` argument is kept for API stability (callers pass it from
 * their 1 Hz ticker) but is no longer consulted — recompute happens via
 * the server poll, which is exactly when the `passed`/`isAtStop` flags
 * actually transition.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function tripProgress(v: Vehicle, _nowSec: number): number {
  if (!v.tripStops || v.tripStops.length === 0) return v.progress;
  const total = v.tripStops.length;
  const reached = v.tripStops.filter((s) => s.passed || s.isAtStop).length;
  return Math.min(1, reached / total);
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
