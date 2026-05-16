import { fetchVehiclesSnapshot, fetchVehiclePatterns } from "@/lib/api";
import { buildVehicles } from "@/lib/interpolate";
import { nowSecondsSinceMidnight } from "@/lib/utils";
import type { VehiclesSnapshot } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CONNS_PER_IP = 2;
const g = globalThis as any;
g.__sseConns ??= new Map<string, number>();
const conns: Map<string, number> = g.__sseConns;

function getIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Server-Sent Events stream of vehicle positions for a given route.
 * Pushes a JSON payload every 8s; heartbeat every 20s; client just listens to `message` events.
 */
export async function GET(req: Request, { params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await params;

  const ip = getIp(req);
  const current = conns.get(ip) ?? 0;
  if (current >= MAX_CONNS_PER_IP) {
    return new Response("Too many concurrent streams", { status: 429 });
  }
  conns.set(ip, current + 1);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const n = (conns.get(ip) ?? 1) - 1;
    if (n <= 0) conns.delete(ip);
    else conns.set(ip, n);
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let stopped = false;
      const signal = (req as any).signal as AbortSignal | undefined;

      const send = (data: any) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      // Resolve route metadata
      let snapshot: VehiclesSnapshot | null = null;
      try {
        snapshot = await fetchVehiclesSnapshot(routeId);
      } catch (e) {
        if ((e as Error).message === "Invalid routeId") {
          send({ error: "invalid" });
          try { controller.close(); } catch {}
          release();
          return;
        }
      }

      if (!snapshot) {
        send({ error: "unknown route" });
        try { controller.close(); } catch {}
        release();
        return;
      }

      const { route, stops: uniq, geometry } = snapshot;

      async function tick() {
        if (stopped) return;
        try {
          const patternsByStop = await fetchVehiclePatterns(routeId, uniq, 8);
          const vehicles = buildVehicles(route, uniq, patternsByStop, nowSecondsSinceMidnight(), geometry);
          send({ vehicles, ts: Date.now() });
        } catch {
          send({ error: true, ts: Date.now() });
        }
      }

      // initial push, then every 8 s
      await tick();

      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(": ping\n\n")); } catch {}
      }, 20_000);

      const iv = setInterval(tick, 8_000);
      signal?.addEventListener("abort", () => {
        stopped = true;
        clearInterval(iv);
        clearInterval(heartbeat);
        try { controller.close(); } catch {}
        release();
      });
    },
    cancel() {
      release();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
