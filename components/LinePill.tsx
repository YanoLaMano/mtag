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
  const dims =
    size === "sm" ? "min-w-[28px] h-6 text-[11px] px-1.5"
      : size === "lg" ? "min-w-[44px] h-10 text-base px-2.5"
        : "min-w-[34px] h-8 text-sm px-2";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md font-semibold tabular tracking-tight",
        dims,
        className
      )}
      style={{ background: bg, color: fg }}
    >
      {route.shortName}
    </span>
  );
}
