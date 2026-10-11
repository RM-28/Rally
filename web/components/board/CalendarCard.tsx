"use client";

import { useState } from "react";
import { Icon, Segmented } from "@/components/rally/primitives";
import { personName, projectLabel } from "@/lib/board";
import type { State } from "@/lib/types";
import Gantt from "./Gantt";

export default function CalendarCard({ state }: { state: State }) {
  const [week, setWeek] = useState<"normal" | "events">("normal");
  const [plan, setPlan] = useState<"team" | "fcfs">("team");
  const run = state.run;
  const events = week === "events" && !!state.showcase_events;
  const team = events ? state.showcase_events : state.showcase;
  if (!team || !run) return null;
  const fcfsPlan = events ? run.showcase_events_fcfs_plan : run.showcase_fcfs_plan;
  const fcfsMs = fcfsPlan?.makespan ?? (events ? run.showcase_events_fcfs : run.showcase_fcfs) ?? null;
  const showFcfs = plan === "fcfs" && !!fcfsPlan;
  const shown = showFcfs ? fcfsPlan! : team;
  const people = Array.from({ length: team.n_machines }, (_, m) => personName(m));
  const ev = team.event;
  const sooner = fcfsMs && fcfsMs > team.makespan ? Math.round(((fcfsMs - team.makespan) / fcfsMs) * 100) : null;

  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-[18px]">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[220px] flex-1">
          <h2 className="m-0 text-[16px] font-semibold">The team’s best calendar</h2>
          <div className="text-[12px] text-ink-3">
            {team.n_machines} people · {team.n_jobs} projects · one row per person, one color per project
          </div>
        </div>
        {state.showcase_events && (
          <Segmented
            small
            options={[
              ["normal", "Normal week"],
              ["events", "With surprises"],
            ]}
            value={week}
            onChange={setWeek}
          />
        )}
        {fcfsPlan && (
          <Segmented
            small
            options={[
              ["team", "Team’s plan"],
              ["fcfs", "First come, first served"],
            ]}
            value={plan}
            onChange={setPlan}
          />
        )}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
        {fcfsMs != null && (
          <span>
            <span className="text-ink-3">First come, first served </span>
            <span className="font-code font-semibold">hour {fcfsMs}</span>
          </span>
        )}
        <span>
          <span className="text-ink-3">Team’s plan </span>
          <span className="font-code font-semibold">hour {team.makespan}</span>
        </span>
        {sooner != null && <span className="font-semibold text-ok">{sooner}% sooner</span>}
      </div>
      {events && ev && (
        <div className="flex items-center gap-2 rounded-[10px] bg-warn-bg px-3 py-2 text-[13px] text-warn-fg">
          <Icon name="event_busy" size={18} />
          {personName(ev.busiest_machine)} is out from hour {ev.window[0]} to {ev.window[1]}, and project {projectLabel(ev.late_job)} can’t start until hour {ev.release}. The bots never trained on this.
        </div>
      )}
      <Gantt
        rows={shown.rows}
        people={people}
        domain={Math.max(fcfsMs ?? 0, team.makespan)}
        downtime={shown.downtime}
        marker={showFcfs ? team.makespan : null}
        late={events && ev ? ev.late_job : null}
      />
      <div className="text-[12px] text-ink-3">
        {showFcfs ? "The dashed line shows where the team’s plan finishes." : fcfsPlan ? "Switch to first come, first served to compare. Hover a task to see its hours." : "Hover a task to see its hours."}
      </div>
    </div>
  );
}
