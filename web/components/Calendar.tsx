"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Showcase } from "@/lib/types";

const hue = (j: number) => (j * 137.508) % 360;

export default function Calendar({
  showcase,
  baselineMakespan,
  baselineLabel = "first come, first served",
  rowLabels,
  jobLabels,
}: {
  showcase: Showcase;
  baselineMakespan?: number;
  baselineLabel?: string;
  rowLabels?: string[];
  jobLabels?: string[];
}) {
  // remember the previous finish line so the move left is visible
  const prev = useRef<number | null>(null);
  const [ghost, setGhost] = useState<number | null>(null);
  useEffect(() => {
    if (prev.current != null && prev.current !== showcase.makespan) setGhost(prev.current);
    prev.current = showcase.makespan;
  }, [showcase.makespan]);
  const hatchId = `hatch-${useId().replace(/:/g, "")}`;

  const scaleMax = Math.max(showcase.makespan, ghost ?? 0, baselineMakespan ?? 0);
  const W = 1000;
  const rowH = showcase.n_machines <= 8 ? 26 : 18;
  const labelW = 76;
  const busyW = 62; // right-hand "% busy" column
  const top = 22; // room for the "sooner" label
  const fontSize = rowH > 18 ? 12 : 10;
  const H = top + showcase.n_machines * rowH + 26;
  const plotW = W - labelW - busyW;
  const x = (t: number) => labelW + (t / scaleMax) * plotW;
  const saved = baselineMakespan != null ? baselineMakespan - showcase.makespan : 0;

  const busy = showcase.rows.map((ops) => ops.reduce((sum, [, , s, e]) => sum + (e - s), 0) / Math.max(1, showcase.makespan));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="schedule calendar">
      <defs>
        <pattern id={hatchId} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="2" height="4" fill="#ff5d6c88" />
        </pattern>
      </defs>

      {/* time saved vs the simple plan */}
      {saved > 0 && (
        <g>
          <rect x={x(showcase.makespan)} y={top} width={x(baselineMakespan!) - x(showcase.makespan)} height={showcase.n_machines * rowH} fill="#3ddc97" fillOpacity={0.12} />
          <text x={(x(showcase.makespan) + x(baselineMakespan!)) / 2} y={top - 7} fontSize={12} fill="#3ddc97" textAnchor="middle" fontFamily="var(--font-plex-mono)">
            {saved.toLocaleString()} h sooner
          </text>
        </g>
      )}

      {showcase.rows.map((ops, m) => {
        const y = top + m * rowH;
        return (
          <g key={m}>
            <text x={4} y={y + rowH / 2 + fontSize / 3} fontSize={fontSize} fill="#8fa1c0" fontFamily="var(--font-plex-mono)">
              {(rowLabels?.[m] ?? `person ${m + 1}`).slice(0, 11)}
            </text>
            {/* idle time = the dark background showing through between bars */}
            <rect x={labelW} y={y + 1} width={x(showcase.makespan) - labelW} height={rowH - 2} fill="#050b18" />
            {(showcase.downtime[String(m)] ?? []).map(([a, b], i) => (
              <rect key={`d${i}`} x={x(a)} y={y + 1} width={Math.max(1, x(b) - x(a))} height={rowH - 2} fill={`url(#${hatchId})`}>
                <title>{`${rowLabels?.[m] ?? `person ${m + 1}`} is out: ${a} to ${b}`}</title>
              </rect>
            ))}
            {ops.map(([j, k, s, e]) => (
              <rect
                key={`${j}-${k}`}
                x={x(s)}
                y={y + 2}
                width={Math.max(0.8, x(e) - x(s) - 0.5)}
                height={rowH - 4}
                rx={1.5}
                fill={`hsl(${hue(j)} 65% 58%)`}
                style={{ transition: "x 0.8s ease, width 0.8s ease" }}
              >
                <title>{`${rowLabels?.[m] ?? `person ${m + 1}`}: ${jobLabels?.[j] ?? `project ${j + 1}`}, task ${k + 1}, hours ${s} to ${e}`}</title>
              </rect>
            ))}
            <text x={W - 4} y={y + rowH / 2 + fontSize / 3} fontSize={fontSize} fill={busy[m] > 0.85 ? "#e6edf7" : "#8fa1c0"} textAnchor="end" fontFamily="var(--font-plex-mono)">
              {Math.round(busy[m] * 100)}% busy
            </text>
          </g>
        );
      })}

      {baselineMakespan != null && (
        <line x1={x(baselineMakespan)} x2={x(baselineMakespan)} y1={top} y2={H - 20} stroke="#ff5d6c" strokeDasharray="4 3" strokeWidth={1.5} />
      )}
      {ghost != null && ghost !== showcase.makespan && (
        <line x1={x(ghost)} x2={x(ghost)} y1={top} y2={H - 20} stroke="#8fa1c0" strokeDasharray="2 3" strokeWidth={1.5} />
      )}
      <line x1={x(showcase.makespan)} x2={x(showcase.makespan)} y1={top} y2={H - 20} stroke="#2f8cff" strokeWidth={2.5} style={{ transition: "all 0.8s ease" }} />
      <text x={x(showcase.makespan) - 4} y={H - 6} fontSize={12} fill="#2f8cff" textAnchor="end" fontFamily="var(--font-plex-mono)">
        bots finish: {showcase.makespan.toLocaleString()} h
      </text>
      {baselineMakespan != null && (
        <text x={W - 4} y={H - 6} fontSize={12} fill="#ff5d6c" textAnchor="end" fontFamily="var(--font-plex-mono)">
          {baselineLabel}: {baselineMakespan.toLocaleString()} h
        </text>
      )}
    </svg>
  );
}
