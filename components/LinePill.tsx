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
  // Chrono round group: trunk Express lines (C1–C8) plus C10, C11. All share
  // the disc identity of the trams. C9, C12, C13, C14 and every other bus
  // keep the rectangular pill. C10/C11 are 3-char short names so the font
  // is one notch smaller to keep the disc size uniform across the group.
  const isChronoRound = /^C(?:[1-8]|10|11)$/.test(route.shortName);
  const round = isTram || isChronoRound;
  const tightFont = isChronoRound && route.shortName.length >= 3;
  let dims: string;
  if (isTram) {
    dims =
      size === "sm" ? "w-6 h-6 text-[11px]"
        : size === "lg" ? "w-10 h-10 text-base"
          : "w-8 h-8 text-sm";
  } else if (isChronoRound) {
    if (size === "sm") dims = tightFont ? "w-7 h-7 text-[9px]" : "w-7 h-7 text-[10px]";
    else if (size === "lg") dims = tightFont ? "w-11 h-11 text-xs" : "w-11 h-11 text-sm";
    else dims = tightFont ? "w-9 h-9 text-[10px]" : "w-9 h-9 text-xs";
  } else {
    dims =
      size === "sm" ? "min-w-[28px] h-6 text-[11px] px-1.5"
        : size === "lg" ? "min-w-[44px] h-10 text-base px-2.5"
          : "min-w-[34px] h-8 text-sm px-2";
  }
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
