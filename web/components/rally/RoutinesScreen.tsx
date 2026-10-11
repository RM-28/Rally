"use client";

import { accent, stamp } from "@/lib/rally/format";
import { useRally, whoOf } from "@/lib/rally/store";
import { Avatar, btn, Icon, PageHeader, Switch } from "./primitives";

const COLS = "grid-cols-[minmax(240px,2fr)_minmax(120px,1fr)_minmax(190px,1.2fr)_minmax(140px,1fr)_130px_64px_104px]";

export default function RoutinesScreen() {
  const { state, actions } = useRally();
  return (
    <section aria-label="Routines" className="min-w-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-7 pt-7 pb-12">
        <PageHeader title="Routines" sub="Recurring work agents run on a schedule. Results post to the room you pick.">
          <button onClick={actions.addRoutine} className={btn.primary}>
            <Icon name="add" size={18} />
            New routine
          </button>
        </PageHeader>
        <div className="overflow-auto rounded-[14px] border border-line bg-surface" role="table" aria-label="Routines">
          <div role="row" className={`grid ${COLS} min-w-[1000px] border-b border-line bg-sunken text-[12px] font-medium text-ink-3`}>
            {["Routine", "Agent", "Schedule", "Posts to", "Last run", "On", ""].map((h, i) => (
              <span key={i} role="columnheader" className={i === 0 ? "px-4 py-2.5" : "px-3 py-2.5"}>
                {h}
              </span>
            ))}
          </div>
          {state.routines.map((r) => {
            const w = whoOf(state, r.agentId);
            const room = state.rooms.find((x) => x.id === r.roomId);
            const running = r.lastRun === "Running…";
            const dim = { opacity: r.enabled ? 1 : 0.55 };
            return (
              <div key={r.id} role="row" className={`grid ${COLS} min-w-[1000px] items-center border-b border-line last:border-b-0`} style={{ minHeight: "calc(var(--row) + 12px)" }}>
                <span role="cell" className="px-4 py-2" style={dim}>
                  <span className="block font-medium">{r.name}</span>
                  <span className="block text-[12px] text-ink-3">{r.description}</span>
                </span>
                <span role="cell" className="flex items-center gap-2 px-3 py-2" style={dim}>
                  <Avatar id={r.agentId} size={22} radius={6} text={10} weight={700} />
                  {w.name}
                </span>
                <span role="cell" className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap text-ink-2" style={dim} title={r.cron}>
                  <Icon name="schedule" size={16} />
                  {r.schedule}
                </span>
                <span role="cell" className="px-3 py-2 font-code text-[12px] text-ink-2" style={dim}>
                  #{room?.name}
                </span>
                <span role="cell" className="px-3 py-2 text-[13px]" style={{ color: running && w.color ? accent(w.color) : "var(--ink-2)" }}>
                  {r.lastRunAt && !running && r.lastRun !== "Never run" ? `${stamp(r.lastRunAt)} · ${r.lastRun}` : r.lastRun}
                </span>
                <span role="cell" className="px-3 py-2">
                  <Switch on={r.enabled} onChange={() => actions.toggleRoutine(r.id)} label={`${r.name} on`} />
                </span>
                <span role="cell" className="px-3 py-2">
                  <button onClick={() => !running && actions.runRoutine(r.id)} className="h-[30px] rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-medium whitespace-nowrap hover:bg-hover">
                    {running ? "Running…" : "Run now"}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
