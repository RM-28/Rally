"use client";

import Link from "next/link";
import { AUTONOMY, dotColor } from "@/lib/rally/format";
import { useRally } from "@/lib/rally/store";
import { Avatar, btn, Icon, PageHeader } from "./primitives";

const PCOLS = "grid-cols-[minmax(220px,2fr)_minmax(140px,1.2fr)_100px_110px]";

export default function TeamScreen() {
  const { state, actions } = useRally();
  return (
    <section aria-label="Team and agents" className="min-w-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-[1080px] flex-col gap-7 px-7 pt-7 pb-12">
        <PageHeader title="Team" sub="People and agents share rooms, tasks and files.">
          <button className={btn.outline}>Invite people</button>
          <button onClick={() => actions.patch({ createOpen: true })} className={btn.primary}>
            <Icon name="add" size={18} />
            New agent
          </button>
        </PageHeader>
        <div>
          <div className="mb-2.5 font-semibold">Agents</div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3.5">
            {state.agents.map((a) => (
              <Link key={a.id} href={`/agents/${a.id}`} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 text-left hover:border-line-strong hover:shadow-rally">
                <div className="flex items-center gap-2.5">
                  <Avatar id={a.id} size={40} radius={11} text={16} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{a.name}</div>
                    <div className="text-[12px] text-ink-3">{a.role}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[13px] text-ink-2">
                  <span className="h-2 w-2 flex-none rounded-full" style={{ background: dotColor(a) }} />
                  <span className="truncate">{a.paused ? "Paused" : a.now}</span>
                </div>
                <div className="flex gap-1.5">
                  <span className="rounded-md border border-line px-[7px] py-0.5 text-[11px] text-ink-2">{AUTONOMY[a.autonomy].label}</span>
                  <span className="rounded-md border border-line px-[7px] py-0.5 text-[11px] text-ink-2">
                    {a.tools.length} tool{a.tools.length === 1 ? "" : "s"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2.5 font-semibold">People</div>
          <div className="overflow-auto rounded-[14px] border border-line bg-surface" role="table" aria-label="People">
            <div role="row" className={`grid ${PCOLS} min-w-[600px] border-b border-line bg-sunken text-[12px] font-medium text-ink-3`}>
              {["Name", "Role", "Access", "Last active"].map((h) => (
                <span key={h} role="columnheader" className="px-4 py-2.5">
                  {h}
                </span>
              ))}
            </div>
            {state.people.map((p) => (
              <div key={p.id} role="row" className={`grid ${PCOLS} min-w-[600px] items-center border-b border-line last:border-b-0`} style={{ minHeight: "var(--row)" }}>
                <span role="cell" className="flex items-center gap-2.5 px-4 py-1.5">
                  <Avatar id={p.id} size={28} text={11} />
                  <span>
                    <span className="block font-medium">{p.name}</span>
                    <span className="block text-[12px] text-ink-3">{p.email}</span>
                  </span>
                </span>
                <span role="cell" className="px-4 py-1.5 text-ink-2">
                  {p.role}
                </span>
                <span role="cell" className="px-4 py-1.5">
                  <span className="rounded-md border border-line px-[7px] py-0.5 text-[12px]">{p.access}</span>
                </span>
                <span role="cell" className="px-4 py-1.5 text-[13px] text-ink-3">
                  {p.lastActive}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
