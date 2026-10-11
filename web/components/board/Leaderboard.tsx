"use client";

import { Icon } from "@/components/rally/primitives";
import { botSlots, deltaColor, deltaSigned, tint } from "@/lib/board";
import type { State } from "@/lib/types";
import { useBoard } from "./BoardProvider";

const COLS = "44px minmax(130px,1fr) minmax(220px,2.4fr) 96px 96px 104px";
const TAGS: Record<string, [string, string]> = {
  Record: ["var(--ink)", "var(--on-ink)"],
  Fired: ["var(--bad-bg)", "var(--danger)"],
  Kept: ["var(--hover)", "var(--ink-2)"],
};

export default function Leaderboard({ state }: { state: State }) {
  const { openStrategy } = useBoard();
  const n = state.round?.n ?? 0;
  const rows = [...(state.round_results ?? [])].sort((a, b) => (a.practice_gap == null ? 1 : 0) - (b.practice_gap == null ? 1 : 0) || (a.practice_gap ?? 0) - (b.practice_gap ?? 0));
  if (!rows.length) return null;
  const bots = state.bots ?? [];
  const slots = botSlots(bots);
  const firedNow = bots.filter((b) => b.fired_round === n);
  const hiredNow = bots.filter((b) => b.hired_round === n && n > 0);
  const last = state.run && n >= state.run.rounds_planned;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-baseline gap-2.5 px-[18px] pt-4 pb-2.5">
        <h2 className="m-0 text-[16px] font-semibold">Round {n} leaderboard</h2>
        <span className="text-[12px] text-ink-3">
          Ranked on {Object.keys(state.bots?.find((b) => b.latest?.per_instance)?.latest?.per_instance ?? {}).length || 15} practice instances, {state.run?.repeats ?? 3} runs each. Last place leaves the team.
        </span>
      </div>
      <div className="overflow-auto">
        <div className="grid min-w-[700px] border-y border-line bg-sunken text-[12px] font-medium text-ink-3" style={{ gridTemplateColumns: COLS }}>
          <span className="py-2 pl-[18px]">#</span>
          <span className="px-2.5 py-2">Bot</span>
          <span className="px-2.5 py-2">What it changed</span>
          <span className="px-2.5 py-2 text-right">Gap</span>
          <span className="px-2.5 py-2 text-right">vs parent</span>
          <span className="px-2.5 py-2">Result</span>
        </div>
        {rows.map((r, i) => {
          const tag = r.id === state.round?.best_ever_id ? "Record" : firedNow.some((b) => b.name === r.bot) ? "Fired" : "Kept";
          return (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              onClick={() => openStrategy(r.id)}
              onKeyDown={(e) => e.key === "Enter" && openStrategy(r.id)}
              className="grid min-h-[42px] min-w-[700px] cursor-pointer items-center border-b border-line hover:bg-sunken"
              style={{ gridTemplateColumns: COLS }}
            >
              <span className="py-1.5 pl-[18px] font-code text-ink-3">{i + 1}</span>
              <span className="flex items-center gap-2 px-2.5 py-1.5 font-medium">
                <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-md text-[10px] font-bold" style={tint(slots[r.bot])}>
                  {r.bot[0]}
                </span>
                {r.bot}
              </span>
              <span title={r.change ?? ""} className="truncate px-2.5 py-1.5 text-ink-2">
                {r.change}
              </span>
              <span className="px-2.5 py-1.5 text-right font-code font-semibold">{r.practice_gap != null ? `${r.practice_gap.toFixed(2)}%` : "sat out"}</span>
              <span className="px-2.5 py-1.5 text-right font-code" style={{ color: deltaColor(r.delta) }}>
                {deltaSigned(r.delta)}
              </span>
              <span className="px-2.5 py-1.5">
                <span className="rounded-[5px] px-[7px] py-0.5 text-[11px] font-semibold whitespace-nowrap" style={{ background: TAGS[tag][0], color: TAGS[tag][1] }}>
                  {tag}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 bg-sunken px-[18px] py-3 text-[13px]">
        {last && !firedNow.length ? (
          <span className="inline-flex items-center gap-2">
            <Icon name="flag" size={18} className="text-ink-2" />
            <span className="font-semibold">Final round</span>
            <span className="text-ink-2">No one is fired or hired after the last round</span>
          </span>
        ) : (
          <>
            {firedNow.map((b) => {
              const satOut = rows.find((r) => r.bot === b.name)?.practice_gap == null;
              return (
                <span key={b.name} className="inline-flex items-center gap-2">
                  <Icon name="person_remove" size={18} style={{ color: "var(--danger)" }} />
                  <span className="font-semibold">Fired</span>
                  <span className="text-ink-2">
                    {b.name} · {satOut ? "sat out, code failed the tests twice" : "last place"}
                  </span>
                </span>
              );
            })}
            {hiredNow.map((b) => (
              <span key={b.name} className="inline-flex items-center gap-2">
                <Icon name="person_add" size={18} style={{ color: "var(--ok)" }} />
                <span className="font-semibold">Hired</span>
                <span className="text-ink-2">
                  {b.name}
                  {b.angle ? ` · ${b.angle}` : ""}
                </span>
              </span>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
