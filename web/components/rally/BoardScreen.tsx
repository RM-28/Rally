"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Task } from "@/lib/rally-types";
import { accent } from "@/lib/rally/format";
import { useRally, whoOf } from "@/lib/rally/store";
import { Avatar, btn, Icon, PageHeader, Progress, Segmented } from "./primitives";

const COLUMNS: [Task["column"], string, string][] = [
  ["queued", "Queued", "var(--line-strong)"],
  ["in_progress", "In progress", "var(--live)"],
  ["review", "Needs review", "var(--warn)"],
  ["done", "Done", "var(--ok)"],
];

export default function BoardScreen() {
  const { state } = useRally();
  const [filter, setFilter] = useState<"all" | "agents" | "people">("all");
  const isAgent = (id: string) => state.agents.some((a) => a.id === id);
  const tasks = state.tasks.filter((t) => filter === "all" || (filter === "agents" ? isAgent(t.owner) : !isAgent(t.owner)));

  return (
    <section aria-label="Task board" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex-none px-7 pt-6 pb-4">
        <PageHeader title="Board" sub="Everything people and agents are working on, across rooms.">
          <Segmented options={[["all", "All"], ["agents", "Agents"], ["people", "People"]]} value={filter} onChange={setFilter} />
          <button className={btn.primary}>
            <Icon name="add" size={18} />
            New task
          </button>
        </PageHeader>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-7 pb-7">
        <div className="grid grid-cols-[repeat(4,minmax(240px,1fr))] items-start gap-4">
          {COLUMNS.map(([col, name, dot]) => {
            const list = tasks.filter((t) => t.column === col);
            return (
              <div key={col} className="flex flex-col gap-2 rounded-2xl border border-line bg-sunken p-2.5">
                <div className="flex items-center gap-2 px-1.5 pt-1 pb-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
                  <span className="font-semibold">{name}</span>
                  <span className="text-[13px] text-ink-3">{list.length}</span>
                </div>
                {list.length === 0 && <div className="p-4 text-center text-[13px] text-ink-3">Nothing here</div>}
                {list.map((t) => (
                  <TaskCard key={t.id} task={t} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TaskCard({ task: t }: { task: Task }) {
  const { state } = useRally();
  const router = useRouter();
  const w = whoOf(state, t.owner);
  const room = state.rooms.find((r) => r.id === t.roomId);
  const job = t.jobId ? state.jobs.find((j) => j.id === t.jobId) : undefined;
  const ap = t.approvalId ? state.approvals[t.approvalId] : undefined;
  let flag = t.flag ?? "";
  let flagBg = "var(--hover)";
  let flagFg = "var(--ink-2)";
  if (ap) {
    flag = ap.status === "pending" ? "Needs approval" : ap.status === "approved" ? "Approved" : "Declined";
    if (ap.status === "pending") {
      flagBg = "var(--warn-bg)";
      flagFg = "var(--warn-fg)";
    }
  }
  const open = () => router.push(ap ? `/approvals?id=${ap.id}` : w.isAgent ? `/agents/${t.owner}` : `/rooms/${t.roomId}`);

  return (
    <button onClick={open} className="flex flex-col gap-2 rounded-xl border border-line bg-surface text-left hover:border-line-strong hover:shadow-rally" style={{ padding: "var(--pad)" }}>
      <div className="font-medium text-pretty">{t.title}</div>
      <div className="font-code text-[11px] text-ink-3"># {room?.name ?? t.roomId}</div>
      {job && (
        <div className="w-full">
          <Progress pct={job.pct} color={w.color ? accent(w.color) : "var(--ink-2)"} />
        </div>
      )}
      <div className="flex w-full items-center gap-2">
        <Avatar id={t.owner} size={22} radius={6} text={10} />
        <span className="flex-1 truncate text-[12px] text-ink-2">{w.name}</span>
        {flag && (
          <span className="rounded-[5px] px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap" style={{ background: flagBg, color: flagFg }}>
            {flag}
          </span>
        )}
        <span className="text-[12px] whitespace-nowrap text-ink-3">{t.due}</span>
      </div>
    </button>
  );
}
