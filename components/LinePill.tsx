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
  // Chrono Express C1–C8 are the trunk bus lines (tram-grade frequency on
  // dedicated lanes), so they share the round disc identity of the trams.
  // C9–C14 and every other bus keep the rectangular pill — multi-char or
  // numeric short names need width-flex.
  const isChronoTrunk = /^C[1-8]$/.test(route.shortName);
  const round = isTram || isChronoTrunk;
  const dims = isTram
    ? size === "sm" ? "w-6 h-6 text-[11px]"
      : size === "lg" ? "w-10 h-10 text-base"
        : "w-8 h-8 text-sm"
    : isChronoTrunk
      ? size === "sm" ? "w-7 h-7 text-[10px]"
        : size === "lg" ? "w-11 h-11 text-sm"
          : "w-9 h-9 text-xs"
      : size === "sm" ? "min-w-[28px] h-6 text-[11px] px-1.5"
        : size === "lg" ? "min-w-[44px] h-10 text-base px-2.5"
          : "min-w-[34px] h-8 text-sm px-2";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-semibold tabular tracking-tight",
        round ? "rounded-full" : "rounded-md",
        dims,
        className
      )}
      style={{ background: bg, color: fg }}
    >
      {route.shortName}
    </span>
  );
}
