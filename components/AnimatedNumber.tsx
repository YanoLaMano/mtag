"use client";
import { useEffect, useRef, useState } from "react";

/** Smoothly tweens between values for a satisfying "live" feel. */
export function AnimatedNumber({
  value,
  duration = 600,
  format = (n) => Math.round(n).toString(),
  className,
}: {
  value: number | null | undefined;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const [display, setDisplay] = useState<number>(value ?? 0);
  const fromRef = useRef<number>(value ?? 0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (value == null) return;
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    startRef.current = null;

    const step = (t: number) => {
      if (startRef.current == null) startRef.current = t;
      const elapsed = t - startRef.current;
      const k = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const cur = from + (to - from) * eased;
      setDisplay(cur);
      if (k < 1) rafRef.current = requestAnimationFrame(step);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value, duration]);

  if (value == null) return <span className={className}>—</span>;
  return <span className={className}>{format(display)}</span>;
}
