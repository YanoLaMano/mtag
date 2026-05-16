# M temps réel — context for Claude

Real-time tram/bus map for the **M / TAG** transit network in
Grenoble. Public-facing site that talks to `data.mobilites-m.fr`
(no auth; OTP-based REST API).

## Stack

- Next.js 15 App Router · React 18 · TypeScript 5.7
- MapLibre GL JS for the map
- Tailwind 3 · Radix UI primitives
- pnpm

Server routes proxy `data.mobilites-m.fr` so the `Origin` header
required by upstream is set; client code only talks to `/api/*`.

## Layout

```
app/
  api/                  server routes (all proxy data.mobilites-m.fr)
    vehicles/[routeId]      snapshot positions
    stream/vehicles/[id]    SSE stream (heartbeat + per-IP cap)
    stops, line, replay…    dynamic refs (validated with regex)
    plan, isochrone, …      coords validated to Grenoble bbox
  layout.tsx            metadata, manifest, viewport
  page.tsx              app shell (Sidebar + Map)
  widget/stop/[id]      embeddable stop arrivals widget
  icon.png              512×512 — Next 15 auto-injects <link rel=icon>
  apple-icon.png        180×180 — auto-injected for iOS home screen
components/
  Map.tsx (1130 LOC)    god component — split planned (#6 in review)
  Sidebar.tsx           header / filters / favorites / route list
  LiveVehiclesPanel.tsx polls /api/vehicles/<route> every 12 s
  TripPlanner, NearMeFab, CommandPalette, IsochroneControl, …
lib/
  api.ts                upstream() helper + fetchVehiclesSnapshot/
                        fetchVehiclePatterns (shared by both vehicle routes)
  interpolate.ts        derives vehicle positions from stoptimes —
                        dwell detection, cos(lat) anisotropy, polyline
                        snap (PROJ_OK 120 m bus / 70 m tram), bearing
                        look-ahead, trip-ended filter, RT coherence
  store.tsx             single Context+useReducer (~13 useApp consumers)
  types.ts              GTFS-ish shapes: Route, Stop, StopTime,
                        StopTimePattern, Vehicle, LineGeometry
  utils.ts, toast.tsx, interpolate.ts
public/
  favicon.ico           multi-res 16/32/48 (the M réso disc)
  icon-192.png, icon-512.png   PWA manifest icons
  poi/m-logo.png        source 800×342 "M réso" wordmark; also
                        consumed by Map.tsx (POI icons via Canvas)
  sw.js, manifest.webmanifest
```

## Upstream API surface

Base: `https://data.mobilites-m.fr`. All calls go through
`upstream()` which sets `Origin: https://m-realtime.app` and uses
Next's fetch cache (`next.revalidate`).

- `/api/routers/default/index/routes` (revalidate 3600)
- `/api/routers/default/index/routes/<id>/stops` (3600)
- `/api/routers/default/index/stops/<id>/stoptimes` (8–15)
- `/api/lines/json?types=ligne&codes=<id>` (86400) — geometry
- `/api/bbox/json?types=parking&xmin=...` (3600)
- `/api/dyn/parking/json` (30)

**No GTFS-RT VehiclePositions feed exists.** I probed 20+ endpoints
incl. `/otp/.../vehiclepositions` (those 200s are SPA HTML fallback,
not real). Vehicle positions are derived from stoptimes — see
`lib/interpolate.ts`.

## Vehicle position pipeline (read this before touching positions)

1. Server: for each stop on the route, fetch `stoptimes` upstream
   in parallel, group `StopTime` entries by `tripId`.
2. Per trip, classify events relative to `nowSec`:
   - `arrive ≤ now ≤ depart` → **dwelling at this stop** (vehicle
     pinned to stop coords, `atStopId` set, capped at 90 s).
   - `depart < now` → `prev`.
   - `arrive > now` → `next`.
3. Between prev & next: snap to best-fit polyline (lowest projection
   error in isotropic units + monotonic distance progression),
   reject if either endpoint > PROJ_OK away (120 m bus / 70 m tram);
   fall back to straight line.
4. Bearing comes from sampling 25 m ahead on the polyline.
5. Client (`Map.tsx`) interpolates **linearly** between server
   samples and **extrapolates up to k=1.5** along the last velocity
   vector — this absorbs the 12–24 s server-side lag without leaving
   markers visibly trailing. Bearing eases over the first half then
   locks. When `atStopId` is set, the anim is frozen.

If a vehicle looks wrong: first check `lib/interpolate.ts`
(`PROJ_OK_*`, `TRIP_ENDED_GRACE`, `DWELL_FREEZE_MAX` knobs); then
`Map.tsx` `MAX_EXTRAPOLATION`.

## Known issues / planned

- **Map.tsx is 1130 lines** with 15 `useEffect`s. Split into
  per-layer hooks (`useVehicleLayer`, `useLineLayer`, …) when it
  becomes a problem. Not yet — type-checks clean.
- **MapTiler key** in Map.tsx is the public demo key. Replace
  with `NEXT_PUBLIC_MAPTILER_KEY` before public deploy.
- **Single Context** (lib/store.tsx) — fine until perceptible
  re-render lag; Zustand/Jotai migration is a 5-LOC change.
- **Always-mounted easter eggs** (`KonamiEasterEgg`,
  `CustomCursor`, `FavStopArrivalParticles`) — `next/dynamic` if
  the initial bundle gets too big.

## Convention reminders

- `app/icon.png` + `app/apple-icon.png` are auto-detected by
  Next 15 App Router; do NOT re-declare them in `metadata.icons`
  (it shadows the auto-injection).
- All dynamic API params are regex-validated at the top of each
  handler (see commit `d28f6a0`). Add new dynamic routes the same
  way.
- SSE stream caps at 2 concurrent connections per IP via a
  `globalThis.__sseConns` Map; sends `: ping\n\n` every 20 s.
- Snapshot route revalidate is 15 s, SSE tick is 8 s. If you
  reduce one, reconsider the other for cache coherency.
