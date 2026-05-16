"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { AlertTriangle, ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Disruptions {
  count: number;
  lines: string[];
  source: string;
}

export function DisruptionsBanner() {
  const { state, dispatch } = useApp();
  const [data, setData] = useState<Disruptions | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancel = false;
    const load = () => fetch("/api/disruptions").then((r) => r.json()).then((d) => {
      if (!cancel) setData(d);
    }).catch(() => {});
    load();
    const iv = setInterval(load, 300_000);
    return () => { cancel = true; clearInterval(iv); };
  }, []);

  if (!data || data.count === 0 || dismissed) return null;

  const byShort = new Map(state.routes.map((r) => [r.shortName, r]));

  return (
    <div className="absolute top-4 left-[calc(420px+32px)] right-[420px] z-30 mx-auto max-w-[640px] animate-fade-down">
      <div className="glass-strong border-warning/40 rounded-2xl px-4 py-2.5 flex items-center gap-3 bg-warning-soft/40">
        <AlertTriangle size={16} className="text-warning shrink-0" />
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-fg">
            {data.count} {data.count > 1 ? "lignes perturbées" : "ligne perturbée"}
          </span>
          <div className="flex flex-wrap gap-1">
            {data.lines.slice(0, 10).map((ln) => {
              const route = byShort.get(ln);
              const color = route ? `#${route.color}` : "#94a3b8";
              const fg = "#fff";
              return (
                <button
                  key={ln}
                  type="button"
                  onClick={() => route && dispatch({ type: "SELECT_ROUTE", id: route.id })}
                  className="text-[11px] font-bold px-1.5 h-5 rounded inline-flex items-center transition-transform hover:scale-110"
                  style={{ background: color, color: fg }}
                  title={route?.longName ?? ln}
                >
                  {ln}
                </button>
              );
            })}
            {data.lines.length > 10 && (
              <span className="text-[11px] text-muted">+{data.lines.length - 10}</span>
            )}
          </div>
        </div>
        <a
          href={data.source}
          target="_blank"
          rel="noopener"
          className="text-[11px] text-muted hover:text-fg inline-flex items-center gap-1 transition-colors"
        >
          Détails <ExternalLink size={11} />
        </a>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-md p-1 text-subtle hover:text-fg hover:bg-bg/40 transition-colors"
          aria-label="Fermer"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
