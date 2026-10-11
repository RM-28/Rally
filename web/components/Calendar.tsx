"use client";

import { useEffect, useRef, useState } from "react";
import type { Showcase } from "@/lib/types";

const hue = (j: number) => (j * 137.508) % 360;

export default function Calendar({ showcase, baselineMakespan }: { showcase: Showcase; baselineMakespan?: number }) {
  // remember the previous finish line so the move left is visible
  const prev = useRef<number | null>(null);
  const [ghost, setGhost] = useState<number | null>(null);
  useEffect(() => {
    if (prev.current != null && prev.current !== showcase.makespan) setGhost(prev.current);
    prev.current = showcase.makespan;
  }, [showcase.makespan]);

  const scaleMax = Math.max(showcase.makespan, ghost ?? 0, baselineMakespan ?? 0);
  const W = 1000;
  const rowH = 14;
  const labelW = 72;
  const H = showcase.n_machines * rowH + 24;
  const x = (t: number) => labelW + (t / scaleMax) * (W - labelW - 8);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="schedule calendar">
      {showcase.rows.map((ops, m) => (
        <g key={m}>
          <text x={4} y={m * rowH + 11} fontSize={9} fill="#8fa1c0" fontFamily="var(--font-plex-mono)">
            person {m + 1}
          </text>
          <rect x={labelW} y={m * rowH + 1} width={W - labelW - 8} height={rowH - 2} fill="#0d1a33" />
          {(showcase.downtime[String(m)] ?? []).map(([a, b], i) => (
            <rect key={`d${i}`} x={x(a)} y={m * rowH + 1} width={Math.max(1, x(b) - x(a))} height={rowH - 2} fill="url(#hatch)" />
          ))}
          {ops.map(([j, k, s, e]) => (
            <rect
              key={`${j}-${k}`}
              x={x(s)}
              y={m * rowH + 2}
              width={Math.max(0.8, x(e) - x(s) - 0.4)}
              height={rowH - 4}
              rx={1.5}
              fill={`hsl(${hue(j)} 70% 58%)`}
              style={{ transition: "x 0.8s ease, width 0.8s ease" }}
            >
              <title>{`project ${j + 1}, step ${k + 1}: ${s} to ${e}`}</title>
            </rect>
          ))}
        </g>
      ))}
      <defs>
        <pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="2" height="4" fill="#ff5d6c88" />
        </pattern>
      </defs>
      {baselineMakespan != null && (
        <line x1={x(baselineMakespan)} x2={x(baselineMakespan)} y1={0} y2={H - 20} stroke="#ff5d6c" strokeDasharray="4 3" strokeWidth={1.5} />
      )}
      {ghost != null && ghost !== showcase.makespan && (
        <line x1={x(ghost)} x2={x(ghost)} y1={0} y2={H - 20} stroke="#8fa1c0" strokeDasharray="2 3" strokeWidth={1.5} />
      )}
      <line x1={x(showcase.makespan)} x2={x(showcase.makespan)} y1={0} y2={H - 20} stroke="#2f8cff" strokeWidth={2.5} style={{ transition: "all 0.8s ease" }} />
      <text x={x(showcase.makespan)} y={H - 6} fontSize={11} fill="#2f8cff" textAnchor="end" fontFamily="var(--font-plex-mono)">
        finish {showcase.makespan}
      </text>
      {baselineMakespan != null && (
        <text x={x(baselineMakespan)} y={H - 6} fontSize={11} fill="#ff5d6c" textAnchor="end" fontFamily="var(--font-plex-mono)">
          FCFS {baselineMakespan}
        </text>
      )}
    </svg>
  );
}
