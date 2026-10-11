"use client";

import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CurvePoint } from "@/lib/types";

type Props = {
  curve: CurvePoint[];
  baseline?: number;
  solver?: number;
  solverSecs?: number;
};

export default function ScoreChart({ curve, baseline, solver, solverSecs }: Props) {
  const data = curve.map((c) => ({ round: c.n, practice: c.best_ever, check: c.best_ever_check, roundBest: c.practice }));
  const vals = data.flatMap((d) => [d.practice, d.check, d.roundBest]).filter((v): v is number => v != null);
  const top = Math.max(baseline ?? 0, ...vals, 10);
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 10, right: 24, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="#1a2b4f" strokeDasharray="3 3" />
        <XAxis dataKey="round" stroke="#8fa1c0" tick={{ fontSize: 12 }} label={{ value: "round", position: "insideBottomRight", offset: -2, fill: "#8fa1c0", fontSize: 11 }} />
        <YAxis stroke="#8fa1c0" tick={{ fontSize: 12 }} domain={[0, Math.ceil(top * 1.08)]} unit="%" width={48} />
        <Tooltip
          contentStyle={{ background: "#0a1428", border: "1px solid #2a3d66", borderRadius: 8, fontFamily: "var(--font-plex-mono)" }}
          formatter={(v: number) => (v == null ? "-" : `${v.toFixed(2)}%`)}
          labelFormatter={(l) => `round ${l}`}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {baseline != null && (
          <ReferenceLine y={baseline} stroke="#ff5d6c" strokeDasharray="6 4" label={{ value: `first come, first served ${baseline.toFixed(1)}%`, fill: "#ff5d6c", fontSize: 11, position: "insideTopRight" }} />
        )}
        {solver != null && (
          <ReferenceLine y={solver} stroke="#3ddc97" strokeDasharray="6 4" label={{ value: `solver (${solverSecs ?? "?"}s) ${solver.toFixed(1)}%`, fill: "#3ddc97", fontSize: 11, position: "insideBottomRight" }} />
        )}
        <Line type="monotone" dataKey="practice" name="team best (practice)" stroke="#2f8cff" strokeWidth={3} dot={{ r: 3 }} isAnimationActive={false} />
        <Line type="monotone" dataKey="check" name="team best (unseen check set)" stroke="#ffb547" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
        <Line type="monotone" dataKey="roundBest" name="this round's best" stroke="#2f8cff" strokeOpacity={0.35} strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
