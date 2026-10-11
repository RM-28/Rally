"use client";

import { useId } from "react";
import type { Showcase } from "@/lib/types";
import { fmtDay, fmtTime, fmtWhen, workDayDate, workHourToDate } from "@/lib/worktime";

export const projectColor = (j: number) => `hsl(${(j * 137.508) % 360} 65% 58%)`;

// A real calendar: one row per person, columns are working days (9:00-17:00, weekdays), bars are tasks
// labelled with their project. `compareEnd` draws the other plan's finish and the time saved.
export default function TeamCalendar({
  plan,
  people,
  projects,
  start,
  hoursPerDay,
  compareEnd,
  compareLabel,
}: {
  plan: Showcase;
  people: string[];
  projects: string[];
  start: string;
  hoursPerDay: number;
  compareEnd?: number;
  compareLabel?: string;
}) {
  const hatchId = `hatch-${useId().replace(/:/g, "")}`;
  const horizon = Math.max(plan.makespan, compareEnd ?? 0);
  const days = Math.max(1, Math.ceil(horizon / hoursPerDay));
  const weekly = days > 25; // long plans: label weeks instead of days

  const W = 1000;
  const labelW = 90;
  const busyW = 64;
  const headH = 34;
  const rowH = people.length <= 10 ? 30 : 20;
  const H = headH + people.length * rowH + 28;
  const plotW = W - labelW - busyW;
  const x = (h: number) => labelW + (h / (days * hoursPerDay)) * plotW;
  const dayW = plotW / days;

  const saved = compareEnd != null ? compareEnd - plan.makespan : 0;
  const busy = plan.rows.map((ops) => ops.reduce((s, [, , a, b]) => s + (b - a), 0) / Math.max(1, plan.makespan));

  const ticks: { d: number; label: string; sub?: string }[] = [];
  for (let d = 0; d < days; d++) {
    const date = workDayDate(start, d);
    if (!weekly) ticks.push({ d, label: date.toLocaleDateString([], { weekday: "short" }), sub: date.toLocaleDateString([], { day: "numeric", month: "short" }) });
    else if (d === 0 || date.getDay() === 1) ticks.push({ d, label: "wk of", sub: date.toLocaleDateString([], { day: "numeric", month: "short" }) });
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="team calendar">
      <defs>
        <pattern id={hatchId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="2.5" height="5" fill="#ff5d6c99" />
        </pattern>
      </defs>

      {/* day / week columns */}
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={labelW + t.d * dayW} x2={labelW + t.d * dayW} y1={headH - 4} y2={headH + people.length * rowH} stroke="#1a2b4f" />
          <text x={labelW + t.d * dayW + 3} y={13} fontSize={11} fill="#e6edf7">{t.label}</text>
          <text x={labelW + t.d * dayW + 3} y={26} fontSize={10} fill="#8fa1c0" fontFamily="var(--font-plex-mono)">{t.sub}</text>
        </g>
      ))}

      {saved > 0 && (
        <rect x={x(plan.makespan)} y={headH} width={x(compareEnd!) - x(plan.makespan)} height={people.length * rowH} fill="#3ddc97" fillOpacity={0.12} />
      )}

      {people.map((name, m) => {
        const y = headH + m * rowH;
        return (
          <g key={name}>
            <text x={4} y={y + rowH / 2 + 4} fontSize={12} fill="#e6edf7">{name.slice(0, 13)}</text>
            <rect x={labelW} y={y + 1} width={x(plan.makespan) - labelW} height={rowH - 2} fill="#050b18" />
            {(plan.downtime[String(m)] ?? []).map(([a, b], i) => (
              <rect key={`d${i}`} x={x(a)} y={y + 1} width={Math.max(1, x(b) - x(a))} height={rowH - 2} fill={`url(#${hatchId})`}>
                <title>{`${name} is out: ${fmtWhen(workHourToDate(start, a, hoursPerDay))} to ${fmtWhen(workHourToDate(start, b, hoursPerDay))}`}</title>
              </rect>
            ))}
            {(plan.rows[m] ?? []).map(([j, k, a, b]) => {
              const w = x(b) - x(a);
              const from = workHourToDate(start, a, hoursPerDay);
              const to = workHourToDate(start, b, hoursPerDay);
              return (
                <g key={`${j}-${k}`}>
                  <rect x={x(a) + 0.5} y={y + 3} width={Math.max(1, w - 1)} height={rowH - 6} rx={3} fill={projectColor(j)}>
                    <title>{`${name}: ${projects[j]} (task ${k + 1})\n${fmtWhen(from)} to ${fmtDay(from) === fmtDay(to) ? fmtTime(to) : fmtWhen(to)} · ${b - a} h`}</title>
                  </rect>
                  {w > 46 && (
                    <text x={x(a) + 5} y={y + rowH / 2 + 4} fontSize={rowH > 20 ? 11 : 9} fill="#050b18" pointerEvents="none">
                      {projects[j].slice(0, Math.floor(w / 6.5))}
                    </text>
                  )}
                </g>
              );
            })}
            <text x={W - 4} y={y + rowH / 2 + 4} fontSize={11} fill="#8fa1c0" textAnchor="end" fontFamily="var(--font-plex-mono)">
              {Math.round(busy[m] * 100)}% busy
            </text>
          </g>
        );
      })}

      {compareEnd != null && (
        <line x1={x(compareEnd)} x2={x(compareEnd)} y1={headH} y2={H - 22} stroke="#ff5d6c" strokeDasharray="4 3" strokeWidth={1.5} />
      )}
      <line x1={x(plan.makespan)} x2={x(plan.makespan)} y1={headH} y2={H - 22} stroke="#2f8cff" strokeWidth={2.5} />
      <text x={Math.max(labelW, x(plan.makespan) - 4)} y={H - 6} fontSize={12} fill="#2f8cff" textAnchor={x(plan.makespan) - 4 > labelW + 180 ? "end" : "start"} fontFamily="var(--font-plex-mono)">
        done {fmtWhen(workHourToDate(start, plan.makespan, hoursPerDay))}
      </text>
      {compareEnd != null && compareLabel && (
        <text x={W - 4} y={H - 6} fontSize={12} fill="#ff5d6c" textAnchor="end" fontFamily="var(--font-plex-mono)">
          {compareLabel}: {fmtWhen(workHourToDate(start, compareEnd, hoursPerDay))}
        </text>
      )}
    </svg>
  );
}
