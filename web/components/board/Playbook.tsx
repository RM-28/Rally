"use client";

import type { State } from "@/lib/types";

/** The scribe's lines (at most 12, see parse_playbook), as DO / AVOID tags with the text after the colon. */
export default function Playbook({ state }: { state: State }) {
  const lines = state.playbook ?? [];
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-baseline gap-2">
        <h2 className="m-0 flex-1 text-[16px] font-semibold">What the team has learned</h2>
        <span className="text-[12px] text-ink-3">{lines.length} of 12 lines</span>
      </div>
      {lines.length === 0 && <div className="text-[13px] text-ink-3">Nothing learned yet. The scribe writes after each round.</div>}
      {lines.map((l, i) => {
        const avoid = l.trim().toUpperCase().startsWith("AVOID");
        const cut = l.indexOf(":");
        return (
          <div key={i} className="flex items-start gap-2 text-[13px]">
            <span
              className="mt-px w-[46px] flex-none rounded-[5px] px-1.5 py-0.5 text-center text-[10px] font-bold"
              style={{ background: avoid ? "var(--bad-bg)" : "var(--ok-bg)", color: avoid ? "var(--danger)" : "var(--ok)" }}
            >
              {avoid ? "AVOID" : "DO"}
            </span>
            <span style={{ textWrap: "pretty" }}>{cut >= 0 && cut < 12 ? l.slice(cut + 1).trim() : l}</span>
          </div>
        );
      })}
    </div>
  );
}
