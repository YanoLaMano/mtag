import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function hex(color: string) {
  return color.startsWith("#") ? color : `#${color}`;
}

/** Pick foreground (white/dark) for best contrast on a given hex bg. */
export function readableOn(bg: string): string {
  const c = bg.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return l > 0.6 ? "#0b0d12" : "#ffffff";
}

export function formatRelativeTime(secondsFromNow: number): string {
  if (secondsFromNow <= 30) return "à l'approche";
  if (secondsFromNow < 60) return `${secondsFromNow}s`;
  const m = Math.round(secondsFromNow / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h${(m % 60).toString().padStart(2, "0")}`;
}

/** Seconds since midnight in Europe/Paris (matches API's serviceDay+seconds). */
export function nowSecondsSinceMidnight(): number {
  const d = new Date();
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}
