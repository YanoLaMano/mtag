"use client";
import { useEffect, useState } from "react";
import type { StopTimePattern, Route } from "@/lib/types";
import { formatRelativeTime, nowSecondsSinceMidnight } from "@/lib/utils";

export function WidgetClient({
  stopId, stopName, initial, routes,
}: {
  stopId: string;
  stopName: string;
  initial: StopTimePattern[];
  routes: Route[];
}) {
  const [data, setData] = useState<StopTimePattern[]>(initial);
  const [now, setNow] = useState(nowSecondsSinceMidnight());

  useEffect(() => {
    const refresh = () => fetch(`/api/stoptimes/${stopId}`).then((r) => r.json()).then(setData).catch(() => {});
    const iv = setInterval(refresh, 20_000);
    const ticker = setInterval(() => setNow(nowSecondsSinceMidnight()), 1000);
    return () => { clearInterval(iv); clearInterval(ticker); };
  }, [stopId]);

  return (
    <main className="min-h-dvh bg-bg text-fg p-4 font-sans">
      <header className="flex items-center justify-between mb-3">
        <div>
          <p className="text-overline">Arrêt</p>
          <h1 className="text-title">{stopName}</h1>
        </div>
        <a href="/" target="_blank" rel="noopener" className="text-caption text-accent hover:underline">
          M temps réel ↗
        </a>
      </header>
      <ul className="space-y-2">
        {data.length === 0 && (
          <li className="text-caption">Aucun passage à venir.</li>
        )}
        {data.map((p, i) => {
          const route = routes.find((r) => p.pattern.id.startsWith(`${r.id}:`));
          if (!route) return null;
          const future = p.times
            .filter((t) => (t.realtimeArrival ?? t.scheduledArrival) >= now - 60)
            .slice(0, 3);
          if (!future.length) return null;
          return (
            <li key={i} className="glass rounded-xl p-3 flex items-center gap-3">
              <span
                className="inline-flex items-center justify-center min-w-[34px] h-8 rounded-md font-semibold text-sm"
                style={{ background: `#${route.color}`, color: `#${route.textColor || "ffffff"}` }}
              >
                {route.shortName}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-headline truncate">{p.pattern.lastStopName}</p>
                <div className="flex gap-1.5 mt-1">
                  {future.map((t, ix) => {
                    const sec = (t.realtimeArrival ?? t.scheduledArrival) - now;
                    return (
                      <span
                        key={ix}
                        className={
                          "tabular text-xs font-medium px-1.5 h-5 rounded inline-flex items-center " +
                          (sec < 90 ? "bg-accent text-accent-fg" : "bg-surface text-fg border")
                        }
                      >
                        {formatRelativeTime(Math.max(0, sec))}
                      </span>
                    );
                  })}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <footer className="mt-4 text-[10px] text-subtle">
        Données <a href="https://data.mobilites-m.fr" className="underline">M Open Data</a>
      </footer>
    </main>
  );
}
