"use client";

import Link from "next/link";
import type { Job, Room } from "@/lib/rally-types";
import { AUTONOMY, accent } from "@/lib/rally/format";
import { useRally, visibleJobs, whoOf } from "@/lib/rally/store";
import { Avatar, Icon, LiveDot, Pills, Progress } from "./primitives";

export function DocPreview({ job, big = false }: { job: Job; big?: boolean }) {
  const { state } = useRally();
  const c = whoOf(state, job.agentId).color ?? 1;
  return (
    <div className={`flex flex-col border border-line bg-bg ${big ? "min-h-[180px] gap-2 rounded-[10px] p-4" : "min-h-[132px] gap-1.5 rounded-lg p-3 text-[12px]"}`}>
      <div className={`font-semibold ${big ? "" : "text-[13px]"}`}>{job.doc?.title}</div>
      {job.doc?.lines.map((l) => (
        <div key={l} className="text-pretty text-ink-2">
          {l}
        </div>
      ))}
      <span className={`r-caret ${big ? "h-4 w-2" : "h-3.5 w-[7px]"}`} style={{ background: accent(c) }} />
    </div>
  );
}

export function SheetPreview({ job, big = false }: { job: Job; big?: boolean }) {
  const { state } = useRally();
  const c = whoOf(state, job.agentId).color ?? 1;
  const cell = big ? "px-2.5 py-2" : "px-2 py-1.5";
  return (
    <div className={`overflow-hidden border border-line bg-bg font-code ${big ? "rounded-[10px] text-[12px]" : "rounded-lg text-[11px]"}`}>
      <div className="grid grid-cols-[1.3fr_1fr_1fr] border-b border-line bg-sunken text-ink-3">
        <span className={cell}>Deal</span>
        <span className={cell}>Stage</span>
        <span className={cell}>Value</span>
      </div>
      {job.sheet?.map((r) => (
        <div key={r.deal} className="grid grid-cols-[1.3fr_1fr_1fr] border-b border-line last:border-b-0" style={{ background: r.live ? `var(--a${c}-bg)` : "transparent" }}>
          <span className={cell}>{r.deal}</span>
          <span className={cell} style={r.live ? { color: accent(c), fontWeight: 600 } : undefined}>
            {r.stage}
          </span>
          <span className={cell}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function JobCard({ job }: { job: Job }) {
  const { state } = useRally();
  const w = whoOf(state, job.agentId);
  const color = accent(w.color ?? 1);
  const paused = w.agent?.paused;
  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-surface p-3">
      <div className="flex items-center gap-2.5">
        <Avatar id={job.agentId} size={28} text={12} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{job.title}</div>
          <div className="text-[12px] text-ink-3">
            {w.name} · {job.pct >= 100 ? "Done" : `${Math.round(job.pct)}%`}
          </div>
        </div>
        <Link href={`/agents/${job.agentId}`} title="Open agent" aria-label={`Open ${w.name}`} className="grid h-7 w-7 place-items-center rounded-[7px] text-ink-2 hover:bg-hover">
          <Icon name="open_in_full" size={18} />
        </Link>
      </div>
      {job.preview === "doc" && <DocPreview job={job} />}
      {job.preview === "sheet" && <SheetPreview job={job} />}
      <div className="text-[12px] text-ink-2">{paused ? "Paused" : job.step}</div>
      <Progress pct={job.pct} color={color} />
    </div>
  );
}

export default function LiveWorkPanel({ room }: { room: Room }) {
  const { state, actions } = useRally();
  const jobs = visibleJobs(state).filter((j) => j.roomId === room.id);
  const running = jobs.filter((j) => j.pct < 100).length;
  const files = state.files[room.id] ?? [];
  const members = [...room.people, ...room.agents];

  return (
    <aside aria-label="Live work" className="flex min-h-0 w-[360px] flex-none flex-col border-l border-line bg-sunken">
      <div className="flex flex-none gap-1 border-b border-line px-3.5 py-3">
        <Pills
          className="h-[30px] rounded-lg px-3"
          options={[["live", "Live work"], ["people", "In this room"], ["files", "Files"]]}
          value={state.panelTab}
          onChange={(v) => actions.patch({ panelTab: v })}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3.5">
        {state.panelTab === "live" && (
          <>
            <div className="flex items-center gap-2 text-[12px] text-ink-2">
              {running > 0 && <LiveDot />}
              {running ? `${running} agent${running > 1 ? "s" : ""} working in this room` : jobs.length ? "Recent work in this room" : "No agents working in this room right now. Mention one to hand over a task."}
            </div>
            {jobs.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </>
        )}
        {state.panelTab === "people" &&
          members.map((id) => {
            const w = whoOf(state, id);
            return (
              <div key={id} className="flex items-center gap-2.5 px-1 py-1.5">
                <Avatar id={id} size={32} text={12} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{w.name}</div>
                  <div className="truncate text-[12px] text-ink-3">{w.agent ? (w.agent.paused ? "Paused" : w.agent.now) : w.role}</div>
                </div>
                {w.agent && <span className="rounded-md border border-line px-[7px] py-0.5 text-[11px] whitespace-nowrap text-ink-2">{AUTONOMY[w.agent.autonomy].label}</span>}
              </div>
            );
          })}
        {state.panelTab === "files" &&
          (files.length ? (
            files.map((f) => (
              <div key={f.name} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface p-2.5">
                <div className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-sunken text-ink-2">
                  <Icon name={f.icon} size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium">{f.name}</div>
                  <div className="text-[12px] text-ink-3">{f.meta}</div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-[13px] text-ink-3">No files in this room yet</div>
          ))}
      </div>
    </aside>
  );
}
