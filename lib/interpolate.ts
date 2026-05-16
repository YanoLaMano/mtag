import type { Stop, StopTimePattern, Vehicle, Route, LineGeometry } from "./types";

type LngLat = [number, number];

// ──────────────────────────────────────────────────────────────────────
//  Geometry helpers (pure, no external deps)
//
//  Grenoble sits at ~45.18°N. At this latitude 1° of longitude ≈ 78.7 km
//  while 1° of latitude ≈ 111.3 km. The original code mixed dx/dy in raw
//  degrees, which under-estimates E-W distances by ~30 % and skews any
//  proportional interpolation along curved tracks. We apply a cos(lat)
//  factor on the longitude axis so all distances are isotropic
//  (proportional to meters). Grenoble's metro area spans ~25 km so a
//  single constant cosine is plenty accurate.
// ──────────────────────────────────────────────────────────────────────

const COS_LAT = Math.cos((45.18 * Math.PI) / 180); // ≈ 0.7059

function isoDist2(a: LngLat, b: LngLat) {
  const dx = (a[0] - b[0]) * COS_LAT;
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function projectOnSegment(p: LngLat, a: LngLat, b: LngLat) {
  const abx = (b[0] - a[0]) * COS_LAT;
  const aby = b[1] - a[1];
  const apx = (p[0] - a[0]) * COS_LAT;
  const apy = p[1] - a[1];
  const ab2 = abx * abx + aby * aby;
  let t = ab2 ? (apx * abx + apy * aby) / ab2 : 0;
  t = Math.max(0, Math.min(1, t));
  const proj: LngLat = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  return { t, proj, d2: isoDist2(p, proj) };
}

interface Polyline {
  coords: LngLat[];
  cum: number[]; // cumulative arc length in isotropic-degree units
  total: number;
}

function buildPolyline(coords: LngLat[]): Polyline {
  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + Math.sqrt(isoDist2(coords[i], coords[i - 1])));
  }
  return { coords, cum, total: cum[cum.length - 1] || 0 };
}

function projectStop(line: Polyline, stop: LngLat) {
  let best = { d2: Infinity, dist: 0 };
  for (let i = 0; i < line.coords.length - 1; i++) {
    const r = projectOnSegment(stop, line.coords[i], line.coords[i + 1]);
    if (r.d2 < best.d2) {
      const segLen = line.cum[i + 1] - line.cum[i];
      best = { d2: r.d2, dist: line.cum[i] + r.t * segLen };
    }
  }
  return best;
}

/**
 * Point at `target` arc-length along the polyline, with a forward-smoothed
 * bearing. Looking ahead ~25 m avoids the jittery rotation we'd get from
 * picking the bearing of the micro-segment the point lands on (typical
 * OSM segment is 5-20 m).
 */
const LOOKAHEAD = 0.00035; // ≈ 25 m in isotropic-degree units

function pointAtDistance(line: Polyline, target: number, reversed = false): { pt: LngLat; bearing: number } {
  if (line.coords.length < 2) {
    return { pt: line.coords[0] ?? [0, 0], bearing: 0 };
  }
  const clamped = Math.max(0, Math.min(line.total, target));
  const pt = sampleAt(line, clamped);

  // Bearing: from pt to a point further along the direction of travel.
  const aheadAt = reversed ? clamped - LOOKAHEAD : clamped + LOOKAHEAD;
  const ahead = sampleAt(line, Math.max(0, Math.min(line.total, aheadAt)));
  const bearing = computeBearing(pt, ahead);
  return { pt, bearing };
}

function sampleAt(line: Polyline, target: number): LngLat {
  const clamped = Math.max(0, Math.min(line.total, target));
  let lo = 0;
  let hi = line.cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (line.cum[mid] <= clamped) lo = mid;
    else hi = mid;
  }
  const a = line.coords[lo];
  const b = line.coords[hi];
  const segLen = line.cum[hi] - line.cum[lo];
  const t = segLen ? (clamped - line.cum[lo]) / segLen : 0;
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

function computeBearing(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLon = toRad(b[0] - a[0]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// ──────────────────────────────────────────────────────────────────────
//  Public API used by the /api/vehicles route
// ──────────────────────────────────────────────────────────────────────

export function buildPolylines(geo: LineGeometry): Polyline[] {
  const lines: Polyline[] = [];
  for (const feature of geo.features) {
    const coords = feature.geometry.coordinates as any;
    if (feature.geometry.type === "MultiLineString") {
      for (const ls of coords as LngLat[][]) {
        if (ls.length >= 2) lines.push(buildPolyline(ls));
      }
    } else if (feature.geometry.type === "LineString") {
      if ((coords as LngLat[]).length >= 2) lines.push(buildPolyline(coords as LngLat[]));
    }
  }
  return lines;
}

/**
 * Pick the candidate polyline that best fits a sequence of stops:
 *  - low projection error (vehicles stay glued to the track)
 *  - monotonic distance progression in trip order (right direction)
 */
function pickBestPolyline(
  polylines: Polyline[],
  stops: { lat: number; lon: number }[]
): { line: Polyline; reversed: boolean } | null {
  if (!polylines.length || stops.length < 2) {
    return polylines[0] ? { line: polylines[0], reversed: false } : null;
  }
  let best: { line: Polyline; reversed: boolean; score: number } | null = null;

  for (const pl of polylines) {
    const dists = stops.map((s) => projectStop(pl, [s.lon, s.lat]).dist);

    let projErrSum = 0;
    for (const s of stops) projErrSum += projectStop(pl, [s.lon, s.lat]).d2;
    const projErr = projErrSum / stops.length;

    let monoUp = 0, monoDown = 0, pairs = 0;
    for (let i = 1; i < dists.length; i++) {
      pairs++;
      if (dists[i] > dists[i - 1]) monoUp++;
      else if (dists[i] < dists[i - 1]) monoDown++;
    }
    const upRatio = pairs ? monoUp / pairs : 0;
    const downRatio = pairs ? monoDown / pairs : 0;
    const reversed = downRatio > upRatio;
    const dirScore = Math.max(upRatio, downRatio);

    const fit = -Math.log(projErr + 1e-12) + 12 * dirScore;
    if (!best || fit > best.score) best = { line: pl, reversed, score: fit };
  }

  if (!best) return null;
  return { line: best.line, reversed: best.reversed };
}

interface Event {
  stopId: string;
  arrive: number;
  depart: number;
  headsign: string;
  realtime: boolean;
}

const TRIP_ENDED_GRACE = 60;  // s — keep vehicle visible 60 s past last stop
const DWELL_FREEZE_MAX = 90;  // s — cap reported dwell so a stale event doesn't pin a phantom forever
// Padding around the upstream-reported [arrive, depart] interval: in practice
// the feed often sets arrive == depart even for trams that physically stop
// 20-30 s at every station. Without this pad the dwell branch fires for one
// integer-second window per stop — invisible. The pad enforces a minimum
// visible dwell of ~13 s at every stop while still releasing the vehicle
// well before the next one.
const DWELL_PAD_BEFORE_S = 3;
const DWELL_PAD_AFTER_S = 10;
// Trapezoidal acceleration: ramp-up / cruise / ramp-down fractions of the
// segment, with the ramps capped at this many seconds so they don't dominate
// short segments. Real tram acceleration is ~1 m/s² and cruise ~50 km/h, so
// a hand-tuned 4 s ramp matches actual physics within the noise of the
// 8-second poll cadence.
const ACCEL_RAMP_S = 4;

/**
 * Trapezoidal speed profile: 0 → cruise → 0. Returns the *distance fraction*
 * covered by time `progress` ∈ [0, 1] over a segment of `spanS` seconds.
 * For long segments the ramps take ACCEL_RAMP_S each, the rest is cruise.
 * For short segments (≤ 2·ACCEL_RAMP_S) it collapses to a triangle — no
 * cruise phase, peak speed in the middle, distance-covered curve is a smooth
 * S without flat top.
 */
function trapezoidProfile(progress: number, spanS: number): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  const ramp = Math.min(ACCEL_RAMP_S / spanS, 0.5); // ramp fraction of segment
  const cruise = 1 - 2 * ramp;
  // Integrate the trapezoidal speed curve to get position fraction.
  // Speed peak = 1 / (ramp + cruise) so total area under the curve == 1.
  const peak = 1 / (ramp + cruise);
  if (progress < ramp) {
    // Acceleration phase: speed grows linearly from 0 to peak.
    return 0.5 * peak * (progress * progress) / ramp;
  }
  if (progress < ramp + cruise) {
    // Cruise phase.
    const rampArea = 0.5 * peak * ramp;
    return rampArea + peak * (progress - ramp);
  }
  // Deceleration phase: mirror of acceleration.
  const remaining = 1 - progress;
  return 1 - 0.5 * peak * (remaining * remaining) / ramp;
}

export function buildVehicles(
  route: Route,
  stops: Stop[],
  patternsByStop: Record<string, StopTimePattern[]>,
  nowSec: number,
  geometry?: LineGeometry | null
): Vehicle[] {
  const stopById = new Map(stops.map((s) => [s.gtfsId, s]));
  const byTrip = new Map<string, Event[]>();

  for (const [stopId, patterns] of Object.entries(patternsByStop)) {
    for (const p of patterns) {
      const headsign = p.pattern.lastStopName || p.pattern.shortDesc;
      for (const t of p.times) {
        // Keep raw seconds (may exceed 86400 for night services) — do NOT modulo
        // so trip ordering stays correct across midnight.
        const arrive = t.realtimeArrival ?? t.scheduledArrival;
        const depart = t.realtimeDeparture ?? t.scheduledDeparture;
        const list = byTrip.get(t.tripId) ?? [];
        list.push({ stopId, arrive, depart, headsign, realtime: !!t.realtime });
        byTrip.set(t.tripId, list);
      }
    }
  }

  const polylines = geometry ? buildPolylines(geometry) : [];

  const vehicles: Vehicle[] = [];

  for (const [tripId, rawEvents] of byTrip) {
    rawEvents.sort((a, b) => a.arrive - b.arrive);

    // #9 Coherence: if ANY event of this trip has realtime telemetry,
    // discard the scheduled-only events — they cause prev/next jumps
    // because their numbers come from a different source than the RT ones.
    const hasRT = rawEvents.some((e) => e.realtime);
    const events = hasRT ? rawEvents.filter((e) => e.realtime) : rawEvents;
    if (events.length === 0) continue;

    // Classify events relative to now. The dwell window is padded so the
    // vehicle visibly stops at every arrêt even when upstream reports
    // arrive == depart (which it often does).
    let prev: Event | null = null;
    let next: Event | null = null;
    let dwellingAt: Event | null = null;
    for (const e of events) {
      if (e.arrive - DWELL_PAD_BEFORE_S <= nowSec && nowSec <= e.depart + DWELL_PAD_AFTER_S) {
        dwellingAt = e;
      } else if (e.depart < nowSec) {
        prev = e;
      } else if (e.arrive > nowSec && !next) {
        next = e;
      }
    }

    // #8 Drop trips that ended more than TRIP_ENDED_GRACE seconds ago.
    if (!next && !dwellingAt && prev && nowSec - prev.depart > TRIP_ENDED_GRACE) continue;

    // Pick the polyline for the whole trip once. Used for BOTH dwell (so the
    // vehicle pins to the projection of the stop on the line — i.e. exactly
    // on the rendered trace, not the raw stop coords which sit on the
    // sidewalk a few metres off) AND between-stops interpolation. The
    // previous PROJ_OK gate would silently drop back to straight-line
    // between raw stop coords when the projection was loose, which let
    // vehicles drift off the rendered line — the user wants them always
    // glued to their own line. We now always snap when a polyline exists.
    const tripStopsForPolyline = events.map((e) => stopById.get(e.stopId)!).filter(Boolean);
    const picked = polylines.length ? pickBestPolyline(polylines, tripStopsForPolyline) : null;
    const polyline = picked?.line ?? null;

    const onLineProjection = (s: { lat: number; lon: number }) => {
      if (!polyline) return null;
      const proj = projectStop(polyline, [s.lon, s.lat]);
      const r = pointAtDistance(polyline, proj.dist);
      return { lat: r.pt[1], lon: r.pt[0], brg: r.bearing, dist: proj.dist };
    };

    let lat = 0, lon = 0, brg = 0, progress = 0;
    let atStopId: string | null = null;

    if (dwellingAt) {
      // Vehicle is at this stop — pin to the stop position on the polyline
      // (or raw stop coords if no polyline).
      const s = stopById.get(dwellingAt.stopId);
      if (!s) continue;
      if (nowSec - dwellingAt.arrive > DWELL_FREEZE_MAX) continue;
      const onLine = onLineProjection(s);
      if (onLine) {
        lat = onLine.lat;
        lon = onLine.lon;
        brg = onLine.brg;
      } else {
        lat = s.lat;
        lon = s.lon;
      }
      atStopId = dwellingAt.stopId;
      progress = 0;
    } else if (prev && next && prev.stopId !== next.stopId) {
      const a = stopById.get(prev.stopId);
      const b = stopById.get(next.stopId);
      if (!a || !b) continue;
      const span = Math.max(1, next.arrive - prev.depart);
      progress = Math.min(1, Math.max(0, (nowSec - prev.depart) / span));
      // Trapezoidal speed profile: a real tram accelerates ~3-5 s after
      // leaving a stop, cruises, then brakes ~3-5 s before the next one.
      // Linear progress shows constant speed all the way through; a piecewise
      // trapezoid is a much better match without over-egging the curve like
      // a sinusoidal ease would. Accel/brake fraction shrinks for short
      // segments so we don't end up cruising for 0 seconds.
      const segPos = trapezoidProfile(progress, span);

      if (polyline) {
        const projA = projectStop(polyline, [a.lon, a.lat]);
        const projB = projectStop(polyline, [b.lon, b.lat]);
        if (Math.abs(projA.dist - projB.dist) > 1e-9) {
          const target = projA.dist + (projB.dist - projA.dist) * segPos;
          // Use the trip-wide reversed flag when it's decisive (circular
          // routes / loops where two consecutive stops can project
          // monotonically increasing even though the trip as a whole runs
          // backwards on the polyline). For straight single-direction
          // routes, pickBestPolyline returns reversed=false and the local
          // projection check stays in charge.
          const localReversed = projB.dist < projA.dist;
          const tripReversed = picked?.reversed === true;
          const reversed = tripReversed || localReversed;
          const r = pointAtDistance(polyline, target, reversed);
          lon = r.pt[0]; lat = r.pt[1]; brg = r.bearing;
        } else {
          // Stops project to the same point on the line — sit there.
          const r = pointAtDistance(polyline, projA.dist);
          lon = r.pt[0]; lat = r.pt[1]; brg = r.bearing;
        }
      } else {
        // No polyline at all — straight line between raw stop coords.
        lat = a.lat + (b.lat - a.lat) * segPos;
        lon = a.lon + (b.lon - a.lon) * segPos;
        brg = computeBearing([a.lon, a.lat], [b.lon, b.lat]);
      }
    } else if (next) {
      const b = stopById.get(next.stopId);
      if (!b) continue;
      const onLine = onLineProjection(b);
      if (onLine) { lat = onLine.lat; lon = onLine.lon; brg = onLine.brg; }
      else { lat = b.lat; lon = b.lon; }
    } else if (prev) {
      const a = stopById.get(prev.stopId);
      if (!a) continue;
      const onLine = onLineProjection(a);
      if (onLine) { lat = onLine.lat; lon = onLine.lon; brg = onLine.brg; }
      else { lat = a.lat; lon = a.lon; }
    } else {
      continue;
    }

    const headsign = (next ?? prev ?? dwellingAt)!.headsign;
    const nextStop = next ? stopById.get(next.stopId)?.name ?? "" : "";

    // Delay: prefer the dwelling event, then the next stop's first matching RT entry.
    let delay = 0;
    const delaySource = dwellingAt ?? next;
    if (delaySource) {
      const patterns = patternsByStop[delaySource.stopId];
      if (patterns) {
        for (const p of patterns) {
          const t = p.times.find((x) => x.tripId === tripId);
          if (t) { delay = t.arrivalDelay ?? 0; break; }
        }
      }
    }

    // Build ordered trip stops with names/coords. Carry the per-event realtime
    // flag through (was previously hardcoded to true).
    const tripStops = events.map((e) => {
      const s = stopById.get(e.stopId);
      const isAtStop = atStopId === e.stopId;
      const isNext = next?.stopId === e.stopId;
      return s ? {
        stopId: e.stopId,
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        arrive: e.arrive,
        depart: e.depart,
        realtime: e.realtime,
        passed: e.depart <= nowSec && !isAtStop,
        isAtStop: isAtStop || undefined,
        isNext: isNext || undefined,
      } : null;
    }).filter(Boolean) as any;

    vehicles.push({
      tripId,
      routeId: route.id,
      shortName: route.shortName,
      color: `#${route.color}`,
      mode: route.mode,
      lat, lon,
      bearing: brg,
      headsign,
      nextStopName: nextStop,
      nextStopId: next?.stopId,
      prevStopId: prev?.stopId,
      atStopId,
      delay,
      progress,
      tripStops,
    });
  }

  return vehicles;
}
