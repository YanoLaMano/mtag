"use client";
import { useEffect, useState } from "react";
import { useToast } from "@/lib/toast";

const SEQUENCE = [
  "ArrowUp", "ArrowUp",
  "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight",
  "ArrowLeft", "ArrowRight",
  "b", "a",
];

// Tram line colors
const COLORS = ["#3376B8", "#479A45", "#C20078", "#F8B219", "#7350A2", "#DC1271"];

export function KonamiEasterEgg() {
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number }[]>([]);
  const toast = useToast();

  useEffect(() => {
    let buf: string[] = [];
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      buf.push(k);
      if (buf.length > SEQUENCE.length) buf = buf.slice(-SEQUENCE.length);
      if (buf.length === SEQUENCE.length && buf.every((v, i) => v === SEQUENCE[i])) {
        fire();
        buf = [];
      }
    };

    const fire = () => {
      // Single full-screen burst centred
      setBursts((b) => [...b, { id: Date.now(), x: innerWidth / 2, y: innerHeight / 2 }]);
      toast.push({ kind: "success", title: "🎉 M réso power-up", description: "Tu connais les classiques.", duration: 2400 });
      // cleanup later
      setTimeout(() => setBursts((b) => b.slice(1)), 2400);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toast]);

  if (bursts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[150] overflow-hidden">
      {bursts.map((b) => (
        <Burst key={b.id} x={b.x} y={b.y} />
      ))}
    </div>
  );
}

function Burst({ x, y }: { x: number; y: number }) {
  const COUNT = 80;
  const pieces = Array.from({ length: COUNT }, (_, i) => {
    const angle = (Math.PI * 2 * i) / COUNT + Math.random() * 0.4;
    const speed = 200 + Math.random() * 350;
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed - 50;
    const color = COLORS[i % COLORS.length];
    const size = 6 + Math.random() * 6;
    const rotateEnd = (Math.random() - 0.5) * 720;
    const delay = Math.random() * 80;
    return { i, dx, dy, color, size, rotateEnd, delay };
  });
  return (
    <>
      {pieces.map((p) => (
        <span
          key={p.i}
          className="absolute block rounded-sm konami-piece"
          style={{
            left: x,
            top: y,
            width: p.size,
            height: p.size * 0.6,
            background: p.color,
            ["--dx" as any]: `${p.dx}px`,
            ["--dy" as any]: `${p.dy}px`,
            ["--rot" as any]: `${p.rotateEnd}deg`,
            animationDelay: `${p.delay}ms`,
          }}
        />
      ))}
      <style>{`
        .konami-piece {
          animation: konami-fly 2.2s var(--ease) forwards;
          will-change: transform, opacity;
        }
        @keyframes konami-fly {
          0%   { transform: translate(-50%, -50%) rotate(0deg); opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy) + 400px)) rotate(var(--rot)); opacity: 0; }
        }
      `}</style>
    </>
  );
}
