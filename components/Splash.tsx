"use client";
import { useEffect, useState } from "react";

const SEGMENTS = ["#FFB400", "#E04E2A", "#DC1271", "#7350A2", "#3376B8", "#0FA9D4", "#479A45", "#C20078"];

export function Splash() {
  const [visible, setVisible] = useState(true);
  const [hide, setHide] = useState(false);

  useEffect(() => {
    // Animation ~1.4s, fade out then unmount
    const t1 = setTimeout(() => setHide(true), 1400);
    const t2 = setTimeout(() => setVisible(false), 1900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center bg-bg transition-opacity duration-500 ${hide ? "opacity-0" : "opacity-100"}`}
    >
      <svg width="120" height="120" viewBox="0 0 120 120" className="splash-logo">
        <defs>
          <clipPath id="ringClip">
            <circle cx="60" cy="60" r="52" />
          </clipPath>
        </defs>
        {/* Coloured ring made of 8 segments */}
        <g className="splash-ring">
          {SEGMENTS.map((c, i) => {
            const a0 = (i / SEGMENTS.length) * 360 - 90 + 3;
            const a1 = ((i + 1) / SEGMENTS.length) * 360 - 90 - 3;
            const r = 50;
            const x0 = 60 + r * Math.cos((a0 * Math.PI) / 180);
            const y0 = 60 + r * Math.sin((a0 * Math.PI) / 180);
            const x1 = 60 + r * Math.cos((a1 * Math.PI) / 180);
            const y1 = 60 + r * Math.sin((a1 * Math.PI) / 180);
            const large = a1 - a0 > 180 ? 1 : 0;
            return (
              <path
                key={i}
                d={`M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`}
                stroke={c}
                strokeWidth="10"
                strokeLinecap="round"
                fill="none"
              />
            );
          })}
        </g>
        {/* Black disc + M (appear in second half) */}
        <g className="splash-core">
          <circle cx="60" cy="60" r="38" fill="#0b0d12" />
          <text
            x="60" y="60"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="Inter, system-ui, sans-serif"
            fontWeight="800"
            fontSize="44"
            fill="#ffffff"
          >M</text>
        </g>
      </svg>
      <p className="mt-5 text-overline text-muted splash-tag">M temps réel</p>
      <style>{`
        .splash-logo { transform-origin: center; }
        .splash-ring { transform-origin: 60px 60px; animation: splash-spin 1.2s var(--ease) forwards; }
        .splash-core { opacity: 0; transform-origin: 60px 60px; animation: splash-pop 0.5s var(--ease) 0.55s forwards; }
        .splash-tag { opacity: 0; animation: splash-fade 0.5s var(--ease) 0.75s forwards; }
        @keyframes splash-spin {
          0%   { transform: rotate(-90deg) scale(0.6); opacity: 0; }
          25%  { opacity: 1; }
          100% { transform: rotate(270deg) scale(1); opacity: 1; }
        }
        @keyframes splash-pop {
          0%   { opacity: 0; transform: scale(0.4); }
          70%  { transform: scale(1.06); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes splash-fade {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
