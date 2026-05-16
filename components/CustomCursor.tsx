"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Subtle desktop cursor: a small dot follows the pointer with delay,
 * scaling up over interactive elements. Disabled on touch / mobile.
 */
export function CustomCursor() {
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const isTouch = matchMedia("(pointer: coarse)").matches;
    const isReduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (isTouch || isReduced) return;
    setEnabled(true);

    let tx = -50, ty = -50;
    let rx = -50, ry = -50;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${tx - 3}px, ${ty - 3}px, 0)`;
      }
    };
    const tick = () => {
      // ease the ring toward target (lag effect)
      rx += (tx - rx) * 0.18;
      ry += (ty - ry) * 0.18;
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${rx - 14}px, ${ry - 14}px, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const interactiveSel = "a,button,input,select,textarea,[role=button],[data-cursor-magnet]";
    const onOver = (e: PointerEvent) => {
      const t = e.target as Element;
      // Zones tagged data-cursor-off (e.g. the route list sidebar) restore the
      // native OS cursor — the active ring scaling was distracting over dense
      // hover targets like the line list.
      const off = t?.closest?.("[data-cursor-off]");
      if (off) {
        ringRef.current?.classList.add("cursor-hidden");
        dotRef.current?.classList.add("cursor-hidden");
        return;
      }
      ringRef.current?.classList.remove("cursor-hidden");
      dotRef.current?.classList.remove("cursor-hidden");
      const inter = t?.closest?.(interactiveSel);
      ringRef.current?.classList.toggle("cursor-active", !!inter);
    };
    const onLeave = () => {
      ringRef.current?.classList.add("cursor-hidden");
      dotRef.current?.classList.add("cursor-hidden");
    };
    const onEnter = () => {
      ringRef.current?.classList.remove("cursor-hidden");
      dotRef.current?.classList.remove("cursor-hidden");
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerover", onOver, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseenter", onEnter);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseenter", onEnter);
    };
  }, []);

  if (!enabled) return null;
  return (
    <>
      <div ref={ringRef} className="m-cursor-ring" aria-hidden />
      <div ref={dotRef} className="m-cursor-dot" aria-hidden />
      <style>{`
        body { cursor: none; }
        a, button, input, select, textarea, [role=button] { cursor: none; }
        /* Zones opted out of the custom cursor restore the native pointer. */
        [data-cursor-off], [data-cursor-off] * { cursor: revert !important; }
        [data-cursor-off] button, [data-cursor-off] a, [data-cursor-off] [role=button] { cursor: pointer !important; }
        [data-cursor-off] input, [data-cursor-off] textarea { cursor: text !important; }
        .m-cursor-ring {
          position: fixed;
          top: 0; left: 0;
          width: 28px; height: 28px;
          border-radius: 9999px;
          border: 1.5px solid hsl(var(--fg) / 0.4);
          pointer-events: none;
          z-index: 9999;
          transition: width 220ms var(--ease), height 220ms var(--ease), border-color 200ms, background 200ms, opacity 200ms;
          will-change: transform;
          mix-blend-mode: difference;
        }
        .m-cursor-dot {
          position: fixed;
          top: 0; left: 0;
          width: 6px; height: 6px;
          border-radius: 9999px;
          background: hsl(var(--accent));
          pointer-events: none;
          z-index: 9999;
          will-change: transform;
        }
        .m-cursor-ring.cursor-active {
          width: 44px; height: 44px;
          border-color: hsl(var(--accent) / 0.5);
          background: hsl(var(--accent) / 0.08);
          transform-origin: center;
        }
        .m-cursor-ring.cursor-active ~ .m-cursor-dot,
        .m-cursor-ring.cursor-active { /* slight lag */ }
        .m-cursor-ring.cursor-hidden,
        .m-cursor-dot.cursor-hidden { opacity: 0; }
      `}</style>
    </>
  );
}
