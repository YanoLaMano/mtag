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
 * Trip-wide progress in [0, 1] — fraction of the *whole trip* the vehicle
 * has covered, from origin terminus to arrival terminus. Step-wise: the
 * bar advances by exactly 1/N each time a stop is crossed, where N is the
 * trip's full stop count.
 *
 * Why we don't just count `passed` flags: the upstream `/stoptimes`
 * endpoint only returns *remaining* stops of the trip, never the ones the
 * vehicle has already departed. So `v.tripStops` is always forward-looking
 * and `passed` is always false — naive `reached/total` would peg every
 * vehicle at 0 % until it dwells at one stop, then jump to 1/N. Hence
 * `tripStopsCount` (server-set to the route's full stop count) gives a
 * fixed denominator, and we compute completed = total − remaining.
 *
 * Includes the live segment fraction (`v.progress`) so the value advances
 * smoothly within the current segment instead of stepping by exactly
 * 1/N only at each crossing.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function tripProgress(v: Vehicle, _nowSec: number): number {
  if (!v.tripStops || v.tripStops.length === 0) return v.progress;
  const remaining = v.tripStops.length;
  const total = v.tripStopsCount && v.tripStopsCount >= remaining
    ? v.tripStopsCount
    : remaining;
  // Stops already departed (best estimate). +1 when dwelling because the
  // current dwell stop should count as "reached" the moment we pull in.
  const dwelling = v.tripStops.some((s) => s.isAtStop);
  const completed = Math.max(0, total - remaining) + (dwelling ? 1 : 0);
  // Live segment fraction smooths motion between two stop crossings.
  // Only when actually moving (server `progress` is 0 during dwell).
  const seg = dwelling ? 0 : Math.max(0, Math.min(1, v.progress ?? 0));
  return Math.min(1, (completed + seg) / total);
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
