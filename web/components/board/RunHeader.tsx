"use client";

import { useState } from "react";
import { Icon, Segmented } from "@/components/rally/primitives";
import { APP_NAME } from "@/lib/config";
import { useBoard } from "./BoardProvider";

const ROUNDS = 10;

function phaseOf(run: { status: string; paused?: boolean } | null | undefined): [string, string, string] {
  if (!run) return ["Not started", "var(--hover)", "var(--ink-2)"];
  if (run.paused || run.status === "paused") return ["Paused", "var(--warn-bg)", "var(--warn-fg)"];
  if (run.status === "running") return ["Running", "var(--ok-bg)", "var(--ok)"];
  if (run.status === "finished") return ["Finished", "var(--hover)", "var(--ink-2)"];
  if (run.status === "failed") return ["Failed", "var(--bad-bg)", "var(--danger)"];
  return ["Stopped", "var(--hover)", "var(--ink-2)"];
}

export default function RunHeader() {
  const { state, connected, admin, control, error } = useBoard();
  const [nBots, setNBots] = useState<"4" | "8">("8");
  const run = state?.run;
  const roundN = state?.round?.n ?? 0;
  const planned = run?.rounds_planned ?? 0;
  const running = run?.status === "running" || run?.status === "paused";
  const [phase, phaseBg, phaseFg] = phaseOf(run);
  const best = state?.round?.best_ever_practice_gap;
  const start = state?.curve?.[0]?.best_ever;
  const people = state?.people ?? [];
  // the round on screen is the one being worked on; the round doc lags until it finishes
  const current = run?.status === "running" && !run.paused ? Math.min(roundN + 1, planned) : roundN;

  return (
    <header className="flex flex-none flex-wrap items-center gap-x-[22px] gap-y-3 border-b border-line bg-surface px-5 py-3">
      <div className="flex items-center gap-2.5">
        <span title={connected ? "Live" : "Reconnecting…"} className="h-[9px] w-[9px] flex-none rounded-full" style={{ background: connected ? "var(--live)" : "var(--danger)" }} />
        <div>
          <div className="text-[16px] leading-tight font-semibold">{state?.app_name ?? APP_NAME}</div>
          <div className="font-code text-[11px] text-ink-3">{run ? `${run._id} · ${run.job === "jobshop" ? "job-shop scheduling" : run.job}` : "no run yet"}</div>
        </div>
      </div>

      {run && (
        <div className="flex min-w-[150px] flex-col gap-[5px]">
          <div className="flex items-baseline gap-2">
            <span className="text-[12px] text-ink-3">Round</span>
            <span className="font-code text-[15px] font-semibold">
              {current} of {planned}
            </span>
            <span className="rounded-full px-[7px] py-px text-[11px] font-semibold" style={{ background: phaseBg, color: phaseFg }}>
              {phase}
            </span>
          </div>
          <div className="flex gap-[3px]">
            {Array.from({ length: planned }, (_, i) => {
              const n = i + 1;
              const bg = n <= roundN ? "var(--ink)" : n === current && run.status === "running" && !run.paused ? "var(--live)" : "var(--line-strong)";
              return <span key={i} className="h-[5px] w-3.5 rounded-[2px]" style={{ background: bg }} />;
            })}
          </div>
        </div>
      )}

      {best != null && (
        <div>
          <div className="text-[12px] text-ink-3">Team best</div>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-code text-[20px] leading-[1.1] font-semibold">{best.toFixed(2)}%</span>
            <span className="text-[12px] text-ink-2">behind best known{start != null ? ` · started at ${start.toFixed(2)}%` : ""}</span>
          </div>
        </div>
      )}

      {error && <span className="text-[12px] font-medium text-danger">{error}</span>}
      <span className="flex-1" />

      <div title={people.join(", ")} className="flex items-center gap-2">
        <div className="flex pl-1.5">
          {people.slice(0, 4).map((p) => (
            <span key={p} className="-ml-1.5 grid h-[26px] w-[26px] place-items-center rounded-full border-2 border-surface bg-hover text-[10px] font-semibold">
              {p
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase())
                .join("")}
            </span>
          ))}
        </div>
        <span className="text-[12px] whitespace-nowrap text-ink-2">{people.length} watching</span>
      </div>

      {admin && (
        <div className="flex flex-wrap items-center gap-1.5 border-l border-line pl-3.5">
          <span className="text-[11px] font-semibold tracking-[.04em] text-ink-3">ADMIN</span>
          <Segmented small options={[["4", "4 bots"], ["8", "8 bots"]]} value={nBots} onChange={setNBots} />
          <button
            onClick={() => control("start", { n_bots: Number(nBots), rounds: ROUNDS })}
            disabled={running}
            className="h-[34px] rounded-[10px] bg-ink px-3.5 font-semibold whitespace-nowrap text-on-ink hover:opacity-[.88] disabled:opacity-45"
          >
            Start
          </button>
          <button
            onClick={() => control(run?.paused ? "resume" : "pause")}
            disabled={!running}
            className="inline-flex h-[34px] items-center gap-1.5 rounded-[10px] border border-line-strong bg-surface px-3 font-medium whitespace-nowrap hover:bg-hover disabled:opacity-45"
          >
            <Icon name={run?.paused ? "play_arrow" : "pause"} size={18} />
            {run?.paused ? "Resume" : "Pause"}
          </button>
          <button
            onClick={() => control("stop")}
            disabled={!running}
            className="h-[34px] rounded-[10px] border border-danger px-3 font-medium whitespace-nowrap text-danger hover:bg-bad-bg disabled:opacity-45"
          >
            Stop
          </button>
        </div>
      )}
    </header>
  );
}
