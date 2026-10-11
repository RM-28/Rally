"use client";

import { useMemo, useState } from "react";
import type { Showcase } from "@/lib/types";
import { DAY_START, fmtTime, workDayDate, workHourToDate } from "@/lib/worktime";

export const projectColor = (j: number) => `hsl(${(j * 137.508) % 360} 65% 58%)`;

type Block = { person: number; day: number; from: number; to: number; kind: "task" | "out"; project?: number; task?: number; s: number; e: number };

const ROW_PX = 52; // one working hour
const DAYS_PER_WEEK = 5;

// Split work-hour intervals into per-day blocks (a task can run past 17:00 into the next morning).
function splitByDay(person: number, s: number, e: number, perDay: number, extra: Omit<Block, "person" | "day" | "from" | "to" | "s" | "e">): Block[] {
  const out: Block[] = [];
  let h = s;
  while (h < e) {
    const day = Math.floor(h / perDay);
    const end = Math.min(e, (day + 1) * perDay);
    out.push({ person, day, from: h - day * perDay, to: end - day * perDay, s, e, ...extra });
    h = end;
  }
  return out;
}

function finishPoint(hour: number, perDay: number) {
  const day = hour > 0 && hour % perDay === 0 ? hour / perDay - 1 : Math.floor(hour / perDay);
  return { day, at: hour - day * perDay };
}

// A week calendar: Mon-Fri columns, 9:00-17:00 rows, tasks as blocks. "Everyone" shows a lane per person.
export default function TeamCalendar({
  plan,
  people,
  projects,
  start,
  hoursPerDay,
  compareEnd,
  compareLabel = "first come, first served",
}: {
  plan: Showcase;
  people: string[];
  projects: string[];
  start: string;
  hoursPerDay: number;
  compareEnd?: number;
  compareLabel?: string;
}) {
  const [who, setWho] = useState<number | "all">("all");
  const [week, setWeek] = useState(0);

  const blocks = useMemo(() => {
    const out: Block[] = [];
    plan.rows.forEach((ops, m) => {
      ops.forEach(([j, k, s, e]) => out.push(...splitByDay(m, s, e, hoursPerDay, { kind: "task", project: j, task: k })));
      (plan.downtime[String(m)] ?? []).forEach(([a, b]) => out.push(...splitByDay(m, a, b, hoursPerDay, { kind: "out" })));
    });
    return out;
  }, [plan, hoursPerDay]);

  const totalDays = Math.max(1, Math.ceil(Math.max(plan.makespan, compareEnd ?? 0) / hoursPerDay));
  const weeks = Math.ceil(totalDays / DAYS_PER_WEEK);
  const wk = Math.min(week, weeks - 1);
  const dayIdx = Array.from({ length: DAYS_PER_WEEK }, (_, i) => wk * DAYS_PER_WEEK + i);
  const lanes = who === "all" ? people.map((_, i) => i) : [who];
  const busy = plan.rows.map((ops) => ops.reduce((s, [, , a, b]) => s + (b - a), 0) / Math.max(1, plan.makespan));
  const done = finishPoint(plan.makespan, hoursPerDay);
  const simple = compareEnd != null ? finishPoint(compareEnd, hoursPerDay) : null;
  const hours = Array.from({ length: hoursPerDay }, (_, i) => i);

  return (
    <div className="flex flex-col gap-2">
      {/* who + which week */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5 text-xs">
          <button onClick={() => setWho("all")} className={`px-2.5 py-1 rounded-full border ${who === "all" ? "border-blue text-blue" : "border-navy-600 text-ink-dim"}`}>
            Everyone
          </button>
          {people.map((p, i) => (
            <button key={p} onClick={() => setWho(i)} className={`px-2.5 py-1 rounded-full border ${who === i ? "border-blue text-blue" : "border-navy-600 text-ink-dim"}`}>
              {p} <span className="num opacity-70">{Math.round(busy[i] * 100)}%</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button disabled={wk === 0} onClick={() => setWeek(wk - 1)} className="px-2 py-0.5 rounded border border-navy-600 disabled:opacity-30">‹</button>
          <span className="num text-ink-dim">week {wk + 1} of {weeks}</span>
          <button disabled={wk >= weeks - 1} onClick={() => setWeek(wk + 1)} className="px-2 py-0.5 rounded border border-navy-600 disabled:opacity-30">›</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-navy-700">
        <div className="grid min-w-[640px]" style={{ gridTemplateColumns: `52px repeat(${DAYS_PER_WEEK}, minmax(0, 1fr))` }}>
          {/* header row */}
          <div className="bg-navy-800 border-b border-navy-700" />
          {dayIdx.map((d) => {
            const date = workDayDate(start, d);
            const beyond = d >= totalDays;
            return (
              <div key={d} className={`bg-navy-800 border-b border-l border-navy-700 px-2 py-1.5 ${beyond ? "opacity-40" : ""}`}>
                <div className="text-xs text-ink-dim">{date.toLocaleDateString([], { weekday: "short" })}</div>
                <div className="text-lg leading-tight num">{date.getDate()} <span className="text-xs text-ink-dim">{date.toLocaleDateString([], { month: "short" })}</span></div>
                {who === "all" && people.length <= 8 && (
                  <div className="grid mt-1 text-[10px] text-ink-dim" style={{ gridTemplateColumns: `repeat(${lanes.length}, minmax(0, 1fr))` }}>
                    {lanes.map((p) => (
                      <div key={p} className="truncate text-center" title={people[p]}>{people[p].slice(0, 3)}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* time gutter */}
          <div className="relative" style={{ height: hoursPerDay * ROW_PX }}>
            {hours.map((h) => (
              <div key={h} className="absolute right-1.5 text-[10px] text-ink-dim num" style={{ top: h * ROW_PX - 6 }}>
                {h === 0 ? "" : `${DAY_START + h}:00`}
              </div>
            ))}
          </div>

          {/* day columns */}
          {dayIdx.map((d) => (
            <div key={d} className="relative border-l border-navy-700" style={{ height: hoursPerDay * ROW_PX }}>
              {hours.map((h) => (
                <div key={h} className="absolute inset-x-0 border-t border-navy-700/60" style={{ top: h * ROW_PX }} />
              ))}
              {/* lane separators */}
              {who === "all" &&
                lanes.slice(1).map((_, i) => (
                  <div key={i} className="absolute inset-y-0 border-l border-navy-800" style={{ left: `${((i + 1) / lanes.length) * 100}%` }} />
                ))}

              {blocks
                .filter((b) => b.day === d && lanes.includes(b.person))
                .map((b, i) => {
                  const lane = lanes.indexOf(b.person);
                  const left = (lane / lanes.length) * 100;
                  const width = 100 / lanes.length;
                  const from = workHourToDate(start, b.day * hoursPerDay + b.from, hoursPerDay);
                  const to = workHourToDate(start, b.day * hoursPerDay + b.to, hoursPerDay);
                  const style = { top: b.from * ROW_PX + 1, height: (b.to - b.from) * ROW_PX - 2, left: `calc(${left}% + 2px)`, width: `calc(${width}% - 4px)` };
                  if (b.kind === "out") {
                    return (
                      <div key={`o${i}`} className="absolute rounded-md border border-bad/60 text-[10px] text-bad px-1 overflow-hidden"
                        style={{ ...style, background: "repeating-linear-gradient(45deg, #ff5d6c22 0 6px, transparent 6px 12px)" }}
                        title={`${people[b.person]} is out ${fmtTime(from)}–${fmtTime(to)}`}>
                        out
                      </div>
                    );
                  }
                  const name = projects[b.project!];
                  return (
                    <div key={`t${i}`} className="absolute rounded-md px-1.5 py-1 overflow-hidden text-[#050b18] shadow-sm"
                      style={{ ...style, background: projectColor(b.project!) }}
                      title={`${people[b.person]} · ${name} (task ${b.task! + 1})\n${from.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} ${fmtTime(from)}–${fmtTime(to)}`}>
                      <div className="text-[11px] font-semibold leading-tight truncate">{name}</div>
                      {(b.to - b.from) * ROW_PX > 34 && (
                        <div className="text-[10px] leading-tight truncate opacity-80">
                          {who === "all" ? `${people[b.person]} · ` : ""}{fmtTime(from)}–{fmtTime(to)}
                        </div>
                      )}
                    </div>
                  );
                })}

              {simple && simple.day === d && (
                <div className="absolute inset-x-0 border-t-2 border-dashed border-bad z-10" style={{ top: simple.at * ROW_PX }}>
                  <span className="absolute right-1 -top-4 text-[10px] text-bad bg-navy-950/80 px-1 rounded">{compareLabel} done</span>
                </div>
              )}
              {done.day === d && (
                <div className="absolute inset-x-0 border-t-[3px] border-blue z-10" style={{ top: done.at * ROW_PX }}>
                  <span className="absolute left-1 -top-4 text-[10px] text-blue bg-navy-950/80 px-1 rounded font-semibold">
                    done {fmtTime(workHourToDate(start, plan.makespan, hoursPerDay))}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
