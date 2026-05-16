"use client";
import { hex, readableOn, cn } from "@/lib/utils";
import type { Route } from "@/lib/types";

export function LinePill({
  route,
  size = "md",
  className,
}: { route: Route; size?: "sm" | "md" | "lg"; className?: string }) {
  const bg = hex(route.color);
  const fg = readableOn(bg);
  const isTram = route.mode === "TRAM";
  // Trams = single-letter short names → circular disc.
  // Buses (incl. Chrono C1..C14) = multi-char short names → rounded square pill.
  const dims = isTram
    ? size === "sm" ? "w-6 h-6 text-[11px]"
      : size === "lg" ? "w-10 h-10 text-base"
        : "w-8 h-8 text-sm"
    : size === "sm" ? "min-w-[28px] h-6 text-[11px] px-1.5"
      : size === "lg" ? "min-w-[44px] h-10 text-base px-2.5"
        : "min-w-[34px] h-8 text-sm px-2";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-semibold tabular tracking-tight",
        isTram ? "rounded-full" : "rounded-md",
        dims,
        className
      )}
      style={{ background: bg, color: fg }}
    >
      {route.shortName}
    </span>
  );
}
