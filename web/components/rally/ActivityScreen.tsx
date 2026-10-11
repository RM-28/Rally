"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ActivityResult, ActivityRow } from "@/lib/rally-types";
import { stamp } from "@/lib/rally/format";
import { type RallyState, useRally, whoOf } from "@/lib/rally/store";
import { Avatar, btn, Icon, PageHeader, Segmented } from "./primitives";

const COLS = "grid-cols-[96px_minmax(150px,1fr)_minmax(280px,2.6fr)_minmax(150px,1fr)_120px]";
type Filter = "all" | "agents" | "people" | "waiting";

function resultOf(s: RallyState, r: ActivityRow): ActivityResult | undefined {
  if (!r.approvalId) return r.result;
  const st = s.approvals[r.approvalId]?.status;
  return st === "pending" ? "Waiting" : st === "approved" ? "Approved" : st === "declined" ? "Declined" : r.result;
}

const TAG: Partial<Record<ActivityResult, { bg: string; fg: string; line: string }>> = {
  Waiting: { bg: "var(--warn-bg)", fg: "var(--warn-fg)", line: "transparent" },
  Approved: { bg: "var(--ok-bg)", fg: "var(--ok)", line: "transparent" },
};

export default function ActivityScreen() {
  const { state } = useRally();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const rows = state.activity
    .map((r) => ({ r, res: resultOf(state, r), who: whoOf(state, r.actor), room: state.rooms.find((x) => x.id === r.roomId) }))
    .filter(({ res, who }) => filter === "all" || (filter === "agents" ? who.isAgent : filter === "people" ? !who.isAgent : res === "Waiting"));

  const exportCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [["Time", "Who", "Action", "Room", "Result"], ...rows.map(({ r, res, who, room }) => [r.ts, who.name, r.action, room ? `#${room.name}` : "", res ?? ""])];
    const blob = new Blob([lines.map((l) => l.map(esc).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "rally-activity.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section aria-label="Activity log" className="min-w-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-7 pt-7 pb-12">
        <PageHeader title="Activity" sub="Every action by people and agents, kept for 12 months.">
          <Segmented options={[["all", "All"], ["agents", "Agents"], ["people", "People"], ["waiting", "Waiting"]]} value={filter} onChange={setFilter} />
          <button onClick={exportCsv} className={`${btn.outline} flex-none`}>
            <Icon name="download" size={18} />
            Export CSV
          </button>
        </PageHeader>
        <div className="overflow-auto rounded-[14px] border border-line bg-surface" role="table" aria-label="Activity">
          <div role="row" className={`grid ${COLS} min-w-[840px] border-b border-line bg-sunken text-[12px] font-medium text-ink-3`}>
            {["Time", "Who", "Action", "Room", "Result"].map((h, i) => (
              <span key={h} role="columnheader" className={i === 0 ? "px-4 py-2.5" : "px-3 py-2.5"}>
                {h}
              </span>
            ))}
          </div>
          {rows.length === 0 && <div className="p-8 text-center text-ink-3">Nothing matches this filter.</div>}
          {rows.map(({ r, res, who, room }) => {
            const tag = (res && TAG[res]) || { bg: "transparent", fg: "var(--ink-2)", line: "var(--line)" };
            return (
              <div
                key={r.id}
                role="row"
                tabIndex={0}
                onClick={() => router.push(room ? `/rooms/${room.id}` : "/settings")}
                onKeyDown={(e) => e.key === "Enter" && router.push(room ? `/rooms/${room.id}` : "/settings")}
                className={`grid ${COLS} min-w-[840px] cursor-pointer items-center border-b border-line last:border-b-0 hover:bg-sunken`}
                style={{ minHeight: "var(--row)" }}
              >
                <span role="cell" className="px-4 py-1.5 font-code text-[12px] text-ink-3">
                  {stamp(r.ts)}
                </span>
                <span role="cell" className="flex items-center gap-2 px-3 py-1.5">
                  <Avatar id={r.actor} size={22} radius={6} text={10} weight={700} />
                  {who.name}
                </span>
                <span role="cell" className="px-3 py-1.5 text-pretty">
                  {r.action}
                </span>
                <span role="cell" className="px-3 py-1.5 font-code text-[12px] text-ink-2">
                  {room ? `#${room.name}` : "—"}
                </span>
                <span role="cell" className="px-3 py-1.5">
                  {res && (
                    <span className="rounded-[5px] border px-[7px] py-0.5 text-[11px] font-semibold whitespace-nowrap" style={{ background: tag.bg, color: tag.fg, borderColor: tag.line }}>
                      {res}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
