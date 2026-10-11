"use client";

import { useEffect, useState } from "react";
import { fmtK } from "@/lib/board";
import type { State } from "@/lib/types";
import { useBoard } from "./BoardProvider";

function minutes(run: State["run"], now: number) {
  if (!run?.started_at) return null;
  const end = run.finished_at ? Date.parse(run.finished_at) : now;
  return Math.max(0, Math.round((end - Date.parse(run.started_at)) / 60_000));
}

export default function UsageCard({ state }: { state: State }) {
  const { price, setPrice } = useBoard();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const tokens = (state.usage?.tokens_in ?? 0) + (state.usage?.tokens_out ?? 0);
  const rate = Number(price);
  const mins = minutes(state.run, now);
  const p = state.proposals;
  const rows: [string, string][] = [
    ["Luminal calls", String(state.usage?.calls ?? 0)],
    ["Tokens used", fmtK(tokens)],
    ["Schedules tested", (state.tests_run ?? 0).toLocaleString()],
    ["Run time", mins == null ? "–" : `${mins} min`],
    ["Proposals passed checks", p && p.total ? `${p.ok} / ${p.total}` : "–"],
    ["Cost", price.trim() && Number.isFinite(rate) ? `$${((tokens / 1e6) * rate).toFixed(2)}` : "Add rate"],
  ];
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <h2 className="m-0 text-[16px] font-semibold">Usage</h2>
      <div className="grid grid-cols-2 gap-3">
        {rows.map(([k, v]) => (
          <div key={k}>
            <div className="text-[12px] text-ink-3">{k}</div>
            <div className="font-code text-[17px] font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <label className="flex items-center gap-2 border-t border-line pt-2.5 text-[12px] text-ink-2">
        <span className="flex-1">Luminal rate, $ per 1M tokens</span>
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, "").slice(0, 8))}
          inputMode="decimal"
          placeholder="0.00"
          className="h-[30px] w-20 rounded-lg border border-line-strong bg-bg px-2 text-right font-code outline-none"
        />
      </label>
    </div>
  );
}
