"use client";
import { Footprints, Bike, TrainFront, Car, Leaf } from "lucide-react";
import { compareModes, CO2_GR_PER_KM, formatCO2 } from "@/lib/co2";
import { cn } from "@/lib/utils";

const ICONS: Record<string, any> = { footprints: Footprints, bike: Bike, tram: TrainFront, car: Car };

export function CO2Comparator({ distanceKm }: { distanceKm: number }) {
  const rows = compareModes(distanceKm);
  const max = Math.max(...rows.map((r) => r.co2g), 1);
  const savedVsCar = Math.round(distanceKm * CO2_GR_PER_KM.car_solo - distanceKm * (CO2_GR_PER_KM.tram * 0.5 + CO2_GR_PER_KM.bus_urban * 0.5));

  return (
    <section className="glass rounded-2xl p-3.5 space-y-2.5">
      <header className="flex items-center justify-between">
        <h3 className="text-headline flex items-center gap-1.5">
          <Leaf size={13} className="text-success" /> Empreinte carbone
        </h3>
        <span className="text-caption tabular">{distanceKm.toFixed(1)} km</span>
      </header>
      <ul className="space-y-1.5">
        {rows.map((r) => {
          const Icon = ICONS[r.icon];
          const pct = (r.co2g / max) * 100;
          const isBest = r.key === "transit";
          return (
            <li key={r.key} className="flex items-center gap-3">
              <div className={cn(
                "w-7 h-7 rounded-md inline-flex items-center justify-center shrink-0",
                isBest ? "bg-success-soft text-success" : "bg-surface text-fg"
              )}>
                <Icon size={13} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body truncate">{r.label}</span>
                  <span className="text-caption tabular">{r.timeMin} min · <strong className="text-fg">{formatCO2(r.co2g)}</strong></span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-surface overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-700",
                      r.co2g === 0 ? "bg-success" :
                      r.key === "car" ? "bg-danger" :
                      r.key === "transit" ? "bg-accent" : "bg-warning"
                    )}
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {savedVsCar > 50 && (
        <div className="rounded-xl bg-success-soft/60 text-success px-3 py-2 flex items-center gap-2">
          <Leaf size={13} />
          <span className="text-body">
            <strong className="font-semibold">{formatCO2(savedVsCar)}</strong> évités vs voiture solo.
          </span>
        </div>
      )}
    </section>
  );
}
