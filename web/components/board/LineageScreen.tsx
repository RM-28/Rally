"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/rally/primitives";
import { botSlots, deltaColor, initial, pct, tint } from "@/lib/board";
import { API_URL } from "@/lib/config";
import type { LineageNode } from "@/lib/types";
import { who } from "@/lib/words";
import { useBoard } from "./BoardProvider";

const VERDICT: Record<string, [string, string]> = {
  AVOID: ["var(--bad-bg)", "var(--danger)"],
  "Sat out": ["var(--bad-bg)", "var(--danger)"],
  "Round best": ["var(--ok-bg)", "var(--ok)"],
};

export default function LineageScreen() {
  const { state, openStrategy } = useBoard();
  const asked = useSearchParams().get("sid");
  const sid = asked || state?.round?.best_ever_id || null;
  const [nodes, setNodes] = useState<LineageNode[] | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!sid) return;
    setNodes(null);
    setErr(false);
    fetch(`${API_URL}/api/lineage/${encodeURIComponent(sid)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setNodes)
      .catch(() => setErr(true));
  }, [sid]);

  const slots = botSlots(state?.bots ?? []);
  const isRecord = sid === state?.round?.best_ever_id;

  return (
    <section className="mx-auto flex max-w-[900px] flex-col gap-5 px-6 pt-7 pb-14">
      <div>
        <h1 className="m-0 text-[26px] font-semibold tracking-[-0.01em]">{isRecord ? "How the winning idea evolved" : "How this idea evolved"}</h1>
        <div className="text-ink-2" style={{ textWrap: "pretty" }}>
          {sid ? (
            <>
              <span className="font-code text-[13px]">{sid}</span> traced back through every parent. Side branches are other ideas built on the same step that did not become the next one.
            </>
          ) : (
            "The family tree appears once the team has a record."
          )}
        </div>
      </div>
      {err && <div className="rounded-xl bg-bad-bg p-3 font-medium text-danger">Can’t load this lineage.</div>}
      {sid && !nodes && !err && <div className="text-ink-3">Loading…</div>}
      {nodes && (
        <div className="flex flex-col">
          {nodes.map((n, i) => {
            const leaf = i === nodes.length - 1;
            const baseline = n.bot.startsWith("baseline:");
            return (
              <div key={n.id} className="flex gap-4">
                <div className="flex w-7 flex-none flex-col items-center">
                  <span className="h-3.5 w-0.5" style={{ background: i === 0 ? "transparent" : "var(--ink)" }} />
                  <span className="h-3.5 w-3.5 flex-none rounded-full border-2 border-ink" style={{ background: leaf ? "var(--ink)" : "var(--surface)" }} />
                  <span className="w-0.5 flex-1" style={{ background: leaf ? "transparent" : "var(--ink)" }} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1 pb-4">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => openStrategy(n.id)}
                    onKeyDown={(e) => e.key === "Enter" && openStrategy(n.id)}
                    className="flex cursor-pointer flex-wrap items-center gap-3 rounded-[14px] border bg-surface px-3.5 py-3 hover:border-ink-3"
                    style={{ borderColor: leaf ? "var(--ink)" : "var(--line)", boxShadow: leaf ? "var(--shadow)" : undefined }}
                  >
                    <span className="w-6 font-code text-[12px] text-ink-3">R{n.round}</span>
                    <span className="grid h-7 w-7 flex-none place-items-center rounded-lg text-[12px] font-bold" style={tint(baseline ? undefined : slots[n.bot])}>
                      {initial(n.bot)}
                    </span>
                    <div className="min-w-[180px] flex-1">
                      <div className="line-clamp-2 font-semibold">{baseline ? who(n.bot) : n.change || n.note}</div>
                      <div className="text-[12px] text-ink-3">{baseline ? "Starting baseline" : `${n.bot}${n.note ? ` · ${n.note}` : ""}`}</div>
                    </div>
                    {n.human_message && (
                      <span title={n.human_message.text} className="inline-flex items-center gap-1.5 rounded-full bg-warn-bg px-2 py-[3px] text-[12px] font-medium text-warn-fg">
                        <Icon name="chat" size={16} />
                        {n.human_message.name}’s message
                      </span>
                    )}
                    <div className="text-right">
                      <div className="font-code text-[17px] font-semibold">{pct(n.practice_gap)}</div>
                      <div className="font-code text-[12px]" style={{ color: n.delta != null ? deltaColor(n.delta) : "var(--ink-3)" }}>
                        {n.delta != null ? n.delta.toFixed(2) : "start"}
                      </div>
                    </div>
                  </div>
                  {n.siblings.map((b) => {
                    const [bg, fg] = VERDICT[b.verdict] ?? ["var(--hover)", "var(--ink-2)"];
                    return (
                      <div
                        key={b.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openStrategy(b.id)}
                        onKeyDown={(e) => e.key === "Enter" && openStrategy(b.id)}
                        className="ml-7 flex cursor-pointer flex-wrap items-center gap-2.5 rounded-xl border border-dashed border-line-strong px-3 py-2 text-[13px] hover:bg-sunken"
                      >
                        <span className="font-code text-[11px] text-ink-3">R{b.round}</span>
                        <span className="grid h-5 w-5 place-items-center rounded-md text-[10px] font-bold" style={tint(slots[b.bot])}>
                          {initial(b.bot)}
                        </span>
                        <span className="min-w-[160px] flex-1 truncate text-ink-2" title={b.change}>
                          {b.bot}: {b.change}
                        </span>
                        <span className="font-code">{b.practice_gap != null ? pct(b.practice_gap) : "–"}</span>
                        <span className="rounded-[5px] px-[7px] py-0.5 text-[11px] font-semibold" style={{ background: bg, color: fg }}>
                          {b.verdict}
                        </span>
                      </div>
                    );
                  })}
                  {n.more > 0 && <div className="ml-7 text-[12px] text-ink-3">+ {n.more} more built on this step</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
