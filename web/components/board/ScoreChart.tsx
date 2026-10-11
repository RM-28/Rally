"use client";

import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { State } from "@/lib/types";
import { who } from "@/lib/words";

const MONO = "var(--font-jetbrains-mono), monospace";
const tick = { fontSize: 11, fill: "var(--ink-3)", fontFamily: MONO };

function Legend() {
  return (
    <div className="flex flex-wrap gap-3.5 text-[12px] text-ink-2">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-[3px] w-4 rounded-sm bg-ink" />
        Practice (team best)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-[3px] w-4 rounded-sm" style={{ background: "var(--a2)" }} />
        Check (unseen)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-4 border-t-2 border-dashed border-ink-3" />
        Baselines
      </span>
    </div>
  );
}

export default function ScoreChart({ state }: { state: State }) {
  const curve = state.curve ?? [];
  const planned = state.run?.rounds_planned ?? Math.max(1, curve.length - 1);
  const rule = state.baselines?.simple_rule?.practice;
  const solver = state.solver?.practice;
  const data = curve.map((c) => ({ n: c.n, practice: c.best_ever, check: c.best_ever_check }));
  const vals = [...data.flatMap((d) => [d.practice, d.check]), rule, solver].filter((v): v is number => v != null && v < 200);
  // grid on multiples of 5, like the design's 15/20/25/30
  const lo = vals.length ? Math.max(0, Math.floor(Math.min(...vals) / 5) * 5) : 0;
  const hi = vals.length ? Math.ceil(Math.max(...vals) / 5) * 5 : 40;
  const yTicks = Array.from({ length: Math.round((hi - lo) / 5) + 1 }, (_, i) => lo + i * 5);
  const steered = curve.filter((c) => c.steered_by && c.best_ever != null);

  const last = curve[curve.length - 1];
  const lb = state.round?.leaderboard?.find((l) => l.id === state.round?.best_ever_id);
  const setBy = last && last.n > 0 && lb ? `${who(lb.bot)}${lb.note ? `: ${lb.note.replace(/[.\s]+$/, "")}` : ""}` : "Baseline (best simple rule)";

  return (
    <div className="rounded-2xl border border-line bg-surface p-[18px]">
      <div className="mb-2 flex flex-wrap items-start gap-3">
        <div className="min-w-[220px] flex-1">
          <h2 className="m-0 text-[16px] font-semibold">How far behind the best known plan, each round</h2>
          <div className="text-[12px] text-ink-3">Lower is better. The bots never see the check set.</div>
        </div>
        <Legend />
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 14, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="n" type="number" domain={[0, planned]} ticks={Array.from({ length: planned + 1 }, (_, i) => i)} tick={tick} axisLine={false} tickLine={false} />
          <YAxis domain={[lo, hi]} ticks={yTicks} tick={tick} tickFormatter={(v: number) => `${v}%`} axisLine={false} tickLine={false} width={52} />
          <Tooltip
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, fontFamily: MONO, fontSize: 12, boxShadow: "var(--shadow)" }}
            labelStyle={{ color: "var(--ink-3)" }}
            formatter={(v: number, k: string) => [v == null ? "–" : `${v.toFixed(2)}%`, k === "practice" ? "Practice" : "Check"]}
            labelFormatter={(l) => `Round ${l}`}
          />
          {rule != null && (
            <ReferenceLine y={rule} stroke="var(--ink-3)" strokeWidth={1.2} strokeDasharray="5 4" label={{ value: `Best simple rule · ${rule.toFixed(1)}%`, position: "insideBottomRight", fill: "var(--ink-2)", fontSize: 11 }} />
          )}
          {solver != null && (
            <ReferenceLine
              y={solver}
              stroke="var(--ink-3)"
              strokeWidth={1.2}
              strokeDasharray="2 4"
              label={{ value: `CP-SAT, same ${state.solver?.secs ?? 2} s, ${state.solver?.workers ?? 8} threads · ${solver.toFixed(1)}%`, position: "insideTopRight", fill: "var(--ink-2)", fontSize: 11 }}
            />
          )}
          <Line dataKey="check" stroke="var(--a2)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          <Line dataKey="practice" stroke="var(--ink)" strokeWidth={2.5} dot={{ r: 3.5, fill: "var(--surface)", stroke: "var(--ink)", strokeWidth: 2 }} activeDot={{ r: 4.5 }} isAnimationActive={false} />
          {steered.map((c) => (
            <ReferenceDot
              key={c.n}
              x={c.n}
              y={c.best_ever!}
              r={8}
              fill="none"
              stroke="var(--warn)"
              strokeWidth={2}
              label={{ value: `${c.steered_by!.name}’s message → new record`, position: "right", offset: 12, fill: "var(--ink-2)", fontSize: 11 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {last && (
        <div className="mt-1.5 text-[12px] text-ink-2">
          Round {last.n}: {setBy}. Team best {last.best_ever != null ? `${last.best_ever.toFixed(2)}%` : "–"} on practice
          {last.best_ever_check != null ? `, ${last.best_ever_check.toFixed(1)}% on the unseen check set` : ""}.
        </div>
      )}
    </div>
  );
}
