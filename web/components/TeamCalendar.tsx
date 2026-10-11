"use client";

import { useMemo, useState } from "react";
import type { Showcase } from "@/lib/types";
import { projectFill } from "@/lib/board";
import { DAY_START, fmtTime, workDayDate, workHourToDate } from "@/lib/worktime";

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

const pill = (on: boolean) => ({ background: on ? "var(--ink)" : "transparent", color: on ? "var(--on-ink)" : "var(--ink-2)", borderColor: on ? "var(--ink)" : "var(--line)" });

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
        <div className="flex flex-wrap gap-1.5 text-[12px]">
          <button onClick={() => setWho("all")} className="h-7 rounded-full border px-2.5 font-medium" style={pill(who === "all")}>
            Everyone
          </button>
          {people.map((p, i) => (
            <button key={p} onClick={() => setWho(i)} className="h-7 rounded-full border px-2.5 font-medium" style={pill(who === i)}>
              {p} <span className="font-code opacity-70">{Math.round(busy[i] * 100)}%</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button disabled={wk === 0} onClick={() => setWeek(wk - 1)} className="grid h-7 w-7 place-items-center rounded-lg border border-line-strong hover:bg-hover disabled:opacity-30" aria-label="Previous week">‹</button>
          <span className="font-code text-[12px] text-ink-3">week {wk + 1} of {weeks}</span>
          <button disabled={wk >= weeks - 1} onClick={() => setWeek(wk + 1)} className="grid h-7 w-7 place-items-center rounded-lg border border-line-strong hover:bg-hover disabled:opacity-30" aria-label="Next week">›</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <div className="grid min-w-[640px]" style={{ gridTemplateColumns: `52px repeat(${DAYS_PER_WEEK}, minmax(0, 1fr))` }}>
          {/* header row */}
          <div className="border-b border-line bg-sunken" />
          {dayIdx.map((d) => {
            const date = workDayDate(start, d);
            const beyond = d >= totalDays;
            return (
              <div key={d} className={`border-b border-l border-line bg-sunken px-2 py-1.5 ${beyond ? "opacity-40" : ""}`}>
                <div className="text-[12px] text-ink-3">{date.toLocaleDateString([], { weekday: "short" })}</div>
                <div className="font-code text-[17px] leading-tight font-semibold">{date.getDate()} <span className="font-rally text-[12px] font-normal text-ink-3">{date.toLocaleDateString([], { month: "short" })}</span></div>
                {who === "all" && people.length <= 8 && (
                  <div className="mt-1 grid text-[10px] text-ink-3" style={{ gridTemplateColumns: `repeat(${lanes.length}, minmax(0, 1fr))` }}>
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
              <div key={h} className="absolute right-1.5 font-code text-[10px] text-ink-3" style={{ top: h * ROW_PX - 6 }}>
                {h === 0 ? "" : `${DAY_START + h}:00`}
              </div>
            ))}
          </div>

          {/* day columns */}
          {dayIdx.map((d) => (
            <div key={d} className="relative border-l border-line" style={{ height: hoursPerDay * ROW_PX }}>
              {hours.map((h) => (
                <div key={h} className="absolute inset-x-0 border-t border-line" style={{ top: h * ROW_PX }} />
              ))}
              {/* lane separators */}
              {who === "all" &&
                lanes.slice(1).map((_, i) => (
                  <div key={i} className="absolute inset-y-0 border-l border-dashed border-line" style={{ left: `${((i + 1) / lanes.length) * 100}%` }} />
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
                      <div key={`o${i}`} className="absolute overflow-hidden rounded-md border border-line-strong px-1 text-[10px] text-ink-3"
                        style={{ ...style, background: "repeating-linear-gradient(135deg,var(--line-strong) 0 2px,transparent 2px 6px)" }}
                        title={`${people[b.person]} is out ${fmtTime(from)}–${fmtTime(to)}`}>
                        out
                      </div>
                    );
                  }
                  const name = projects[b.project!];
                  return (
                    <div key={`t${i}`} className="absolute overflow-hidden rounded-md px-1.5 py-1 text-bar-ink"
                      style={{ ...style, background: projectFill(b.project!) }}
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
                <div className="absolute inset-x-0 z-10 border-t-[1.5px] border-dashed border-ink-2" style={{ top: simple.at * ROW_PX }}>
                  <span className="absolute right-1 -top-4 rounded bg-surface px-1 text-[10px] whitespace-nowrap text-ink-2">{compareLabel} done</span>
                </div>
              )}
              {done.day === d && (
                <div className="absolute inset-x-0 z-10 border-t-[2.5px] border-ink" style={{ top: done.at * ROW_PX }}>
                  <span className="absolute left-1 -top-4 rounded bg-surface px-1 text-[10px] font-semibold whitespace-nowrap text-ink">
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
