export type LineMode = "TRAM" | "BUS" | "RAIL" | "FUNICULAR";

export interface Route {
  id: string;          // e.g. "SEM:A"
  gtfsId: string;
  shortName: string;   // "A", "C1", "12"
  longName: string;
  color: string;       // hex without #
  textColor: string;
  mode: LineMode;
  type: string;        // TRAM, CHRONO, PROXIMO, FLEXO, SCOL...
}

export interface Stop {
  gtfsId: string;
  id: string;
  code?: string;
  city?: string;
  name: string;
  lat: number;
  lon: number;
  cluster?: string;
  clusterGtfsId?: string;
}

export interface LineGeometry {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { CODE: string; type: string; id: string };
    geometry: { type: "MultiLineString" | "LineString"; coordinates: any };
  }>;
}

export interface StopTimePattern {
  pattern: {
    id: string;
    desc: string;
    dir: number;
    shortDesc: string;
    lastStop: string;
    lastStopName: string;
  };
  times: StopTime[];
}

export interface StopTime {
  stopId: string;
  stopName: string;
  scheduledArrival: number;
  scheduledDeparture: number;
  realtimeArrival: number;
  realtimeDeparture: number;
  arrivalDelay: number;
  departureDelay: number;
  realtime: boolean;
  realtimeState: string;
  serviceDay: number;
  tripId: string;
  pickupType?: string;
}

export interface VehicleTripStop {
  stopId: string;
  name: string;
  lat: number;
  lon: number;
  arrive: number;   // seconds since service-day midnight
  depart: number;
  realtime: boolean;
  passed: boolean;  // true if already gone past
  isAtStop?: boolean;
  isNext?: boolean;
}

export interface Vehicle {
  tripId: string;
  routeId: string;
  shortName: string;
  color: string;
  mode: LineMode;
  lat: number;
  lon: number;
  bearing: number;
  headsign: string;
  nextStopName: string;
  nextStopId?: string;
  prevStopId?: string;
  /** Stop currently occupied (vehicle dwelling or arriving) — null when between stops. */
  atStopId?: string | null;
  delay: number;
  progress: number;
  tripStops?: VehicleTripStop[];
}
