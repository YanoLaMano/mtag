import { describe, it, expect } from "vitest";
import { buildVehicles } from "../interpolate";
import type {
  Route,
  Stop,
  StopTimePattern,
  StopTime,
  LineGeometry,
  LineMode,
} from "../types";

// ──────────────────────────────────────────────────────────────────────
// Fixture helpers — Grenoble coordinates (~45.18°N, 5.72°E).
// At this latitude: 1° lat ≈ 111,320 m; 1° lon ≈ 78,600 m (cos≈0.706).
// ──────────────────────────────────────────────────────────────────────

const NOW = 12 * 3600; // noon in service seconds

function makeRoute(mode: LineMode = "BUS"): Route {
  return {
    id: "SEM:TEST",
    gtfsId: "SEM:TEST",
    shortName: "T1",
    longName: "Test line",
    color: "ff0000",
    textColor: "ffffff",
    mode,
    type: mode === "TRAM" ? "TRAM" : "CHRONO",
  };
}

function makeStop(id: string, lat: number, lon: number, name = id): Stop {
  return { gtfsId: id, id, name, lat, lon };
}

function makeStopTime(
  tripId: string,
  stopId: string,
  arrive: number,
  depart: number,
  realtime: boolean,
  arrivalDelay = 0
): StopTime {
  return {
    stopId,
    stopName: stopId,
    scheduledArrival: arrive,
    scheduledDeparture: depart,
    realtimeArrival: arrive,
    realtimeDeparture: depart,
    arrivalDelay,
    departureDelay: 0,
    realtime,
    realtimeState: realtime ? "UPDATED" : "SCHEDULED",
    serviceDay: 0,
    tripId,
  };
}

function makePattern(times: StopTime[], headsign = "Terminus"): StopTimePattern {
  return {
    pattern: {
      id: "p1",
      desc: headsign,
      dir: 0,
      shortDesc: headsign,
      lastStop: "X",
      lastStopName: headsign,
    },
    times,
  };
}

/**
 * Group stoptimes into `patternsByStop`: each stop gets one pattern containing
 * the StopTime entries observed at that stop (across all trips).
 */
function groupByStop(...all: StopTime[]): Record<string, StopTimePattern[]> {
  const out: Record<string, StopTime[]> = {};
  for (const t of all) {
    (out[t.stopId] ??= []).push(t);
  }
  const result: Record<string, StopTimePattern[]> = {};
  for (const [stopId, times] of Object.entries(out)) {
    result[stopId] = [makePattern(times)];
  }
  return result;
}

// ──────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────

describe("buildVehicles — sanity", () => {
  it("returns an empty array when no patterns are provided", () => {
    const v = buildVehicles(makeRoute(), [makeStop("A", 45.18, 5.72)], {}, NOW);
    expect(v).toEqual([]);
  });
});

describe("buildVehicles — dwelling at a stop", () => {
  it("pins a vehicle to the stop when arrive <= now <= depart", () => {
    const stops = [makeStop("A", 45.18, 5.72), makeStop("B", 45.19, 5.73)];
    const times = [
      makeStopTime("trip1", "A", NOW - 5, NOW + 5, true),
      makeStopTime("trip1", "B", NOW + 60, NOW + 70, true),
    ];
    const v = buildVehicles(makeRoute(), stops, groupByStop(...times), NOW);
    expect(v).toHaveLength(1);
    expect(v[0].atStopId).toBe("A");
    expect(v[0].lat).toBe(45.18);
    expect(v[0].lon).toBe(5.72);
    expect(v[0].progress).toBe(0);
  });

  it("drops a stale dwell event older than DWELL_FREEZE_MAX (90s)", () => {
    const stops = [makeStop("A", 45.18, 5.72)];
    const times = [
      // arrived 100s ago, depart still in future — but dwell is stale
      makeStopTime("trip1", "A", NOW - 100, NOW + 30, true),
    ];
    const v = buildVehicles(makeRoute(), stops, groupByStop(...times), NOW);
    expect(v).toEqual([]);
  });
});

describe("buildVehicles — trip lifecycle filters", () => {
  it("drops trips that ended more than TRIP_ENDED_GRACE (60s) ago", () => {
    const stops = [makeStop("A", 45.18, 5.72)];
    const times = [
      // last event departed 120s ago, no next, no dwell
      makeStopTime("trip1", "A", NOW - 130, NOW - 120, true),
    ];
    const v = buildVehicles(makeRoute(), stops, groupByStop(...times), NOW);
    expect(v).toEqual([]);
  });
});

describe("buildVehicles — straight-line interpolation", () => {
  it("interpolates linearly between prev and next stops when no geometry", () => {
    const stops = [makeStop("A", 45.18, 5.72), makeStop("B", 45.20, 5.74)];
    const times = [
      makeStopTime("trip1", "A", NOW - 30, NOW - 20, true), // prev (departed 20s ago)
      makeStopTime("trip1", "B", NOW + 20, NOW + 30, true), // next (arrives 20s from now)
    ];
    // span = 20 - (-20) = 40s; elapsed since prev.depart = 20s → progress 0.5
    const v = buildVehicles(makeRoute(), stops, groupByStop(...times), NOW);
    expect(v).toHaveLength(1);
    expect(v[0].progress).toBeCloseTo(0.5, 5);
    expect(v[0].lat).toBeCloseTo(45.19, 5);
    expect(v[0].lon).toBeCloseTo(5.73, 5);
    expect(v[0].atStopId).toBeNull();
  });
});

describe("buildVehicles — polyline snapping", () => {
  // Straight polyline running N-S along lon=5.720.
  // We OFFSET THE STOPS east of the polyline by varying amounts to exercise
  // the projection-error gate. Isotropic east offset in degrees of lon:
  //   d_iso = offset * COS_LAT (~0.7059) → meters = d_iso * 111320.
  // So 100 m east ≈ 0.00127° lon; 300 m east ≈ 0.0038° lon.
  function straightGeometry(): LineGeometry {
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { CODE: "T1", type: "ligne", id: "T1" },
          geometry: {
            type: "MultiLineString",
            coordinates: [
              [
                [5.720, 45.170],
                [5.720, 45.180],
                [5.720, 45.190],
                [5.720, 45.200],
                [5.720, 45.210],
              ],
            ],
          },
        },
      ],
    };
  }

  function makeTimes() {
    return [
      makeStopTime("trip1", "A", NOW - 30, NOW - 20, true),
      makeStopTime("trip1", "B", NOW + 20, NOW + 30, true),
    ];
  }

  it("snaps the vehicle to the polyline when stops fit it closely", () => {
    // Stops sit ON the polyline — projection error is 0, snapping accepted.
    // Add a slight east kink by NOT using straight; instead offset stops by ~30m east
    // and use a polyline that runs straight along lon=5.720. The vehicle gets
    // SNAPPED onto the polyline (lon=5.720), proving snapping ran.
    const stops = [
      makeStop("A", 45.180, 5.7204), // ~30 m east of the line
      makeStop("B", 45.200, 5.7204),
    ];
    const geom = straightGeometry();
    const v = buildVehicles(makeRoute("BUS"), stops, groupByStop(...makeTimes()), NOW, geom);
    expect(v).toHaveLength(1);
    // Straight-line fallback would put the vehicle at lon=5.7204.
    // Snapped to the polyline → lon≈5.720. Clearly different.
    expect(v[0].lon).toBeCloseTo(5.720, 4);
  });

  it("falls back to straight line when polyline is >300m off the stops", () => {
    // Stops 0.005° east of the polyline ≈ 393 m offset — way beyond PROJ_OK_BUS.
    const stops = [
      makeStop("A", 45.180, 5.725),
      makeStop("B", 45.200, 5.725),
    ];
    const geom = straightGeometry();
    const v = buildVehicles(makeRoute("BUS"), stops, groupByStop(...makeTimes()), NOW, geom);
    expect(v).toHaveLength(1);
    // Fallback: straight line between the two stops, both at lon=5.725
    expect(v[0].lon).toBeCloseTo(5.725, 4);
  });

  it("TRAM rejects a polyline that BUS accepts (~100m off)", () => {
    // Stops 0.0013° east of the polyline.
    // Isotropic distance: 0.0013 * 0.7059 ≈ 9.18e-4 → squared ≈ 8.4e-7.
    // BUS tolerance 1.2e-6 → accepts. TRAM tolerance 4e-7 → rejects.
    const stops = [
      makeStop("A", 45.180, 5.7213),
      makeStop("B", 45.200, 5.7213),
    ];
    const geom = straightGeometry();

    const vBus = buildVehicles(makeRoute("BUS"), stops, groupByStop(...makeTimes()), NOW, geom);
    const vTram = buildVehicles(makeRoute("TRAM"), stops, groupByStop(...makeTimes()), NOW, geom);

    expect(vBus).toHaveLength(1);
    expect(vTram).toHaveLength(1);

    // BUS snaps onto the polyline at lon=5.720.
    expect(vBus[0].lon).toBeCloseTo(5.720, 4);
    // TRAM falls back to straight line between stops at lon=5.7213.
    expect(vTram[0].lon).toBeCloseTo(5.7213, 4);
  });
});

describe("buildVehicles — RT coherence and per-stop realtime flag", () => {
  it("discards scheduled-only events when any trip event has realtime=true", () => {
    const stops = [
      makeStop("A", 45.180, 5.720),
      makeStop("B", 45.190, 5.720),
      makeStop("C", 45.200, 5.720),
    ];
    // A is RT (prev), B is scheduled-only (should be filtered out),
    // C is RT (next). Without filtering, B at NOW would be picked as "next".
    const times = [
      makeStopTime("trip1", "A", NOW - 30, NOW - 20, true),
      makeStopTime("trip1", "B", NOW + 5, NOW + 10, false),
      makeStopTime("trip1", "C", NOW + 20, NOW + 30, true),
    ];
    const v = buildVehicles(makeRoute(), stops, groupByStop(...times), NOW);
    expect(v).toHaveLength(1);
    // After RT filter: prev=A, next=C → mid-trip between A and C
    expect(v[0].nextStopId).toBe("C");
    expect(v[0].prevStopId).toBe("A");
    expect(v[0].tripStops).toHaveLength(2);
    expect(v[0].tripStops!.map((s) => s.stopId)).toEqual(["A", "C"]);
  });

  it("preserves per-stop realtime flag from the source events (not hardcoded)", () => {
    // No realtime events anywhere → all events kept, realtime flag should reflect source.
    const stops = [makeStop("A", 45.18, 5.72), makeStop("B", 45.19, 5.73)];
    const times = [
      makeStopTime("trip1", "A", NOW - 30, NOW - 20, false),
      makeStopTime("trip1", "B", NOW + 20, NOW + 30, false),
    ];
    const v = buildVehicles(makeRoute(), stops, groupByStop(...times), NOW);
    expect(v).toHaveLength(1);
    expect(v[0].tripStops).toHaveLength(2);
    expect(v[0].tripStops!.every((s) => s.realtime === false)).toBe(true);
  });
});
