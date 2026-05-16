// Smooth animation helpers.
//
// Strategy: linear interpolation between two server samples, and *keep
// extrapolating* along the same velocity vector past the target up to k=1.5
// (so up to TICK_MS/2 extra seconds). The server payload is always behind
// real time (revalidate cache, network) — animating purely A→B would leave
// the marker visibly trailing. With linear extrapolation the marker stays
// roughly aligned with reality and the next tick gently corrects it.
//
// `frozen=true` (set when the server reports the vehicle is dwelling at
// a stop) pins the marker exactly to the target — no extrapolation through
// the stop.
export type Anim = {
  fromLat: number; fromLon: number; fromBearing: number;
  toLat: number; toLon: number; toBearing: number;
  startTs: number; endTs: number;
  frozen?: boolean;
};
export const MAX_EXTRAPOLATION = 1.5;
export function fracOf(a: Anim, now: number) {
  if (a.frozen) return 1;
  if (now <= a.startTs) return 0;
  const k = (now - a.startTs) / Math.max(1, a.endTs - a.startTs);
  return Math.min(k, MAX_EXTRAPOLATION);
}
export function interpLat(a: Anim, now: number) { const k = fracOf(a, now); return a.fromLat + (a.toLat - a.fromLat) * k; }
export function interpLon(a: Anim, now: number) { const k = fracOf(a, now); return a.fromLon + (a.toLon - a.fromLon) * k; }
export function interpBearing(a: Anim, now: number) {
  // Bearing eases over the first half so direction changes look natural,
  // then locks — extrapolating bearing past k=1 would over-rotate at corners.
  const k = Math.min(1, fracOf(a, now));
  let diff = a.toBearing - a.fromBearing;
  if (diff > 180) diff -= 360; else if (diff < -180) diff += 360;
  return (a.fromBearing + diff * k + 360) % 360;
}
