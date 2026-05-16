import type { Stop, StopTimePattern, Vehicle, Route, LineGeometry } from "./types";

type LngLat = [number, number];

// ──────────────────────────────────────────────────────────────────────
//  Geometry helpers (pure, no external deps)
// ──────────────────────────────────────────────────────────────────────

function dist2(a: LngLat, b: LngLat) {
  const dx = a[0] - b[0]; const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function projectOnSegment(p: LngLat, a: LngLat, b: LngLat) {
  const abx = b[0] - a[0], aby = b[1] - a[1];
  const apx = p[0] - a[0], apy = p[1] - a[1];
  const ab2 = abx * abx + aby * aby;
  let t = ab2 ? (apx * abx + apy * aby) / ab2 : 0;
  t = Math.max(0, Math.min(1, t));
  const proj: LngLat = [a[0] + t * abx, a[1] + t * aby];
  return { t, proj, d2: dist2(p, proj) };
}

interface Polyline {
  coords: LngLat[];
  cum: number[]; // cumulative arc length (in degrees — fine for monotonic interpolation)
  total: number;
}

function buildPolyline(coords: LngLat[]): Polyline {
  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i][0] - coords[i - 1][0];
    const dy = coords[i][1] - coords[i - 1][1];
    cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy));
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

function pointAtDistance(line: Polyline, target: number): { pt: LngLat; bearing: number } {
  if (line.coords.length < 2) {
    return { pt: line.coords[0] ?? [0, 0], bearing: 0 };
  }
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
  const pt: LngLat = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  const bearing = computeBearing(a, b);
  return { pt, bearing };
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

/**
 * Build a Polyline list from a MultiLineString geometry. Each sub-line is
 * a candidate path (usually one per direction).
 */
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
 *  - low projection error  (vehicles stay glued to the track)
 *  - monotonic distance progression in trip order (right direction / right loop side)
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

    // Projection RMS error (in degrees²)
    let projErrSum = 0;
    for (const s of stops) projErrSum += projectStop(pl, [s.lon, s.lat]).d2;
    const projErr = projErrSum / stops.length;

    // Monotonic ratio in trip order
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

    // Combined score: lower projection error + better direction consistency wins
    // (we use -log to make small errors dominate, then add a monotonic bonus)
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
        list.push({ stopId, arrive, depart, headsign });
        byTrip.set(t.tripId, list);
      }
    }
  }

  const polylines = geometry ? buildPolylines(geometry) : [];

  const vehicles: Vehicle[] = [];

  for (const [tripId, events] of byTrip) {
    events.sort((a, b) => a.arrive - b.arrive);

    let prev: Event | null = null;
    let next: Event | null = null;
    for (const e of events) {
      if (e.depart <= nowSec) prev = e;
      else if (e.arrive >= nowSec && !next) { next = e; break; }
    }

    let lat = 0, lon = 0, brg = 0, progress = 0;

    if (prev && next && prev.stopId !== next.stopId) {
      const a = stopById.get(prev.stopId);
      const b = stopById.get(next.stopId);
      if (!a || !b) continue;
      const span = Math.max(1, next.arrive - prev.depart);
      progress = Math.min(1, Math.max(0, (nowSec - prev.depart) / span));

      const tripStops = events.map((e) => stopById.get(e.stopId)!).filter(Boolean);
      const picked = polylines.length ? pickBestPolyline(polylines, tripStops) : null;

      let positioned = false;
      if (picked) {
        const { line: bestLine } = picked;
        const projA = projectStop(bestLine, [a.lon, a.lat]);
        const projB = projectStop(bestLine, [b.lon, b.lat]);
        // Reject the polyline if either endpoint is far from it (> ~120 m in degrees²)
        // 120 m at Grenoble's latitude ≈ 0.0012° → squared ≈ 1.4e-6
        const PROJ_OK = 4e-6;
        if (projA.d2 < PROJ_OK && projB.d2 < PROJ_OK) {
          const dA = projA.dist;
          const dB = projB.dist;
          if (Math.abs(dA - dB) > 1e-9) {
            const target = dA + (dB - dA) * progress;
            const r = pointAtDistance(bestLine, target);
            lon = r.pt[0]; lat = r.pt[1]; brg = r.bearing;
            if (dB < dA) brg = (brg + 180) % 360;
            positioned = true;
          }
        }
      }
      if (!positioned) {
        // Fallback: straight line between stops
        lat = a.lat + (b.lat - a.lat) * progress;
        lon = a.lon + (b.lon - a.lon) * progress;
        brg = computeBearing([a.lon, a.lat], [b.lon, b.lat]);
      }
    } else if (next) {
      const b = stopById.get(next.stopId);
      if (!b) continue;
      lat = b.lat; lon = b.lon;
    } else if (prev) {
      const a = stopById.get(prev.stopId);
      if (!a) continue;
      lat = a.lat; lon = a.lon;
    } else {
      continue;
    }

    const headsign = (next ?? prev)!.headsign;
    const nextStop = next ? stopById.get(next.stopId)?.name ?? "" : "";

    // Delay: use the next stop's first matching real-time entry if available
    let delay = 0;
    if (next) {
      const patterns = patternsByStop[next.stopId];
      if (patterns) {
        for (const p of patterns) {
          const t = p.times.find((x) => x.tripId === tripId);
          if (t) { delay = t.arrivalDelay ?? 0; break; }
        }
      }
    }

    // Determine if currently AT a stop (dwelling or arrival window)
    let atStopId: string | null = null;
    if (prev && next && prev.stopId !== next.stopId) {
      if (progress < 0.08) atStopId = prev.stopId;
      else if (progress > 0.92) atStopId = next.stopId;
    } else if (next) {
      atStopId = next.stopId;
    } else if (prev) {
      atStopId = prev.stopId;
    }

    // Build ordered trip stops with names/coords
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
        realtime: true,
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
