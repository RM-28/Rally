"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/rally/primitives";
import { projectFill, projectLabel } from "@/lib/board";
import { API_URL } from "@/lib/config";
import type { ScheduleRequest, ScheduleResponse } from "@/lib/types";
import Gantt from "./Gantt";

type Draft = {
  people: string[];
  projects: [number, string][][]; // [person, hours] per task, in order
  off: [number, string, string][]; // person, from, to
  late: [number, string][]; // project, hour
};

const EXAMPLE: Draft = {
  people: ["Ana", "Ben", "Cai"],
  projects: [
    [[1, "5"], [2, "1"], [0, "3"]],
    [[0, "1"], [2, "3"], [1, "1"]],
    [[0, "1"], [2, "4"], [1, "5"]],
  ],
  off: [],
  late: [],
};
const copy = (d: Draft): Draft => JSON.parse(JSON.stringify(d));
const digits = (v: string, n = 4) => v.replace(/[^0-9]/g, "").slice(0, n);

// survives moving between screens, so the last plan is still there when you come back
type Planned = { people: string[]; downtime: Record<string, [number, number][]> };
let memo: { draft: Draft; res: ScheduleResponse | null; planned: Planned } | null = null;

const field = "h-[30px] rounded-lg border border-line-strong bg-bg px-1.5 outline-none";
const num = `${field} w-11 text-right font-code`;

export default function ScheduleScreen() {
  const [d, setD] = useState<Draft>(() => memo?.draft ?? copy(EXAMPLE));
  const [res, setRes] = useState<ScheduleResponse | null>(memo?.res ?? null);
  const [planned, setPlanned] = useState<Planned>(memo?.planned ?? { people: [], downtime: {} });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [newPerson, setNewPerson] = useState("");

  const edit = (fn: (x: Draft) => void) =>
    setD((cur) => {
      const x = copy(cur);
      fn(x);
      return x;
    });

  const run = async (draft = d) => {
    if (!draft.people.length) return setErr("Add at least one person.");
    if (!draft.projects.length) return setErr("Add at least one project.");
    const empty = draft.projects.findIndex((p) => !p.length);
    if (empty >= 0) return setErr(`Project ${projectLabel(empty)} has no tasks. Add one or remove the project.`);
    const body: ScheduleRequest = {
      people: draft.people,
      projects: draft.projects.map((p, j) => ({ name: projectLabel(j), tasks: p.map(([person, h]) => ({ person, hours: Math.max(1, Number(h) || 1) })) })),
      time_off: draft.off.filter(([, a, b]) => Number(b) > Number(a)).map(([person, a, b]) => ({ person, from: Number(a), to: Number(b) })),
      late_starts: draft.late.map(([project, h]) => ({ project, hour: Number(h) || 0 })),
    };
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`${API_URL}/api/schedule`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail : "The planner could not read this calendar. Check the hours.");
      const downtime: Planned["downtime"] = {};
      for (const o of body.time_off) (downtime[String(o.person)] ??= []).push([o.from, o.to]);
      const p = { people: draft.people.slice(), downtime };
      setRes(j);
      setPlanned(p);
      memo = { draft, res: j, planned: p };
    } catch (e) {
      setErr(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Can’t reach the engine.");
    } finally {
      setBusy(false);
    }
  };

  // first visit: plan the example so the screen opens with a result
  useEffect(() => {
    if (!memo) run(EXAMPLE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (memo) memo.draft = d;
  }, [d]);

  const addPerson = () => {
    const v = newPerson.trim().slice(0, 24);
    if (!v || d.people.length >= 30) return;
    edit((x) => x.people.push(v));
    setNewPerson("");
  };
  const removePerson = (i: number) =>
    edit((x) => {
      if (x.people.length <= 1) return;
      x.people.splice(i, 1);
      const shift = (m: number) => (m > i ? m - 1 : m);
      x.projects = x.projects.map((p) => p.filter(([m]) => m !== i).map(([m, h]) => [shift(m), h] as [number, string]));
      x.off = x.off.filter(([m]) => m !== i).map(([m, a, b]) => [shift(m), a, b] as [number, string, string]);
    });
  const removeProject = (j: number) =>
    edit((x) => {
      x.projects.splice(j, 1);
      x.late = x.late.filter(([p]) => p !== j).map(([p, h]) => [p > j ? p - 1 : p, h] as [number, string]);
    });

  const nTasks = d.projects.reduce((a, p) => a + p.length, 0);
  const personOpts = d.people.map((p, i) => (
    <option key={i} value={i}>
      {p}
    </option>
  ));
  const dom = res ? Math.max(res.fcfs.makespan, res.team.makespan, 1) : 1;

  return (
    <section className="mx-auto flex max-w-[1320px] flex-col gap-5 px-6 pt-7 pb-14">
      <div>
        <h1 className="m-0 text-[26px] font-semibold tracking-[-0.01em]">Schedule your team</h1>
        <div className="max-w-[74ch] text-ink-2" style={{ textWrap: "pretty" }}>
          Add your people and projects. Each project is a list of tasks in order, and each task needs one person for a set number of hours. We run the team’s frozen best strategy on it in the same sandbox. It never tunes anything, so the final results stay valid.
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-5">
        {/* form */}
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-[18px] rounded-2xl border border-line bg-surface p-[18px]">
          <div className="flex flex-col gap-2">
            <div className="font-semibold">People</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {d.people.map((p, i) => (
                <span key={i} className="inline-flex h-[30px] items-center gap-1 rounded-full border border-line bg-sunken pr-1 pl-3 font-medium">
                  {p}
                  <button onClick={() => removePerson(i)} title={`Remove ${p}`} aria-label={`Remove ${p}`} className="grid h-[22px] w-[22px] place-items-center rounded-full text-ink-3 hover:bg-hover hover:text-ink">
                    <Icon name="close" size={16} />
                  </button>
                </span>
              ))}
              <input
                value={newPerson}
                onChange={(e) => setNewPerson(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPerson()}
                onBlur={addPerson}
                placeholder="Add a person"
                className="h-[30px] w-[140px] rounded-full border border-line-strong bg-bg px-2.5 outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="flex items-center">
              <div className="flex-1 font-semibold">Projects</div>
              <button
                onClick={() => edit((x) => x.projects.length < 26 && x.projects.push(x.people.map((_, i) => [i, "2"] as [number, string])))}
                className="inline-flex h-[30px] items-center gap-1 rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] font-medium whitespace-nowrap hover:bg-hover"
              >
                <Icon name="add" size={17} />
                Project
              </button>
            </div>
            {d.projects.map((p, j) => (
              <div key={j} className="flex flex-col gap-2 rounded-xl border border-line px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-5 w-5 flex-none rounded-[5px]" style={{ background: projectFill(j) }} />
                  <span className="flex-1 font-semibold">Project {projectLabel(j)}</span>
                  <button onClick={() => removeProject(j)} title="Remove project" aria-label={`Remove project ${projectLabel(j)}`} className="grid h-7 w-7 place-items-center rounded-[7px] text-ink-3 hover:bg-hover hover:text-ink">
                    <Icon name="delete" size={18} />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {p.map(([m, h], k) => (
                    <span key={k} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong bg-bg pr-1 pl-2">
                      <span className="font-code text-[11px] text-ink-3">{k + 1}</span>
                      <select value={m} onChange={(e) => edit((x) => (x.projects[j][k][0] = Number(e.target.value)))} aria-label="Person" className="border-0 bg-transparent text-[13px] font-medium">
                        {personOpts}
                      </select>
                      <input
                        value={h}
                        onChange={(e) => edit((x) => (x.projects[j][k][1] = digits(e.target.value, 3)))}
                        inputMode="numeric"
                        aria-label="Hours"
                        className="h-6 w-[34px] border-0 border-l border-line bg-transparent text-right font-code text-[12px] outline-none"
                      />
                      <span className="text-[11px] text-ink-3">h</span>
                      <button onClick={() => edit((x) => x.projects[j].splice(k, 1))} title="Remove task" aria-label="Remove task" className="grid h-[22px] w-[22px] place-items-center rounded-md text-ink-3 hover:bg-hover">
                        <Icon name="close" size={15} />
                      </button>
                    </span>
                  ))}
                  <button
                    onClick={() => edit((x) => x.projects[j].length < 30 && x.projects[j].push([x.projects[j].length % Math.max(1, x.people.length), "2"]))}
                    className="h-8 rounded-lg border border-dashed border-line-strong px-2.5 text-[13px] whitespace-nowrap text-ink-2 hover:bg-hover"
                  >
                    + Task
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div className="flex flex-col gap-2">
              <div className="flex items-center">
                <div className="flex-1 font-semibold">Time off</div>
                <button onClick={() => edit((x) => x.off.push([0, "2", "4"]))} className="text-[13px] font-medium underline underline-offset-2">
                  Add
                </button>
              </div>
              {d.off.length === 0 && <div className="text-[13px] text-ink-3">Nobody is out.</div>}
              {d.off.map(([m, a, b], i) => (
                <div key={i} className="flex flex-wrap items-center gap-1.5 text-[13px]">
                  <select value={m} onChange={(e) => edit((x) => (x.off[i][0] = Number(e.target.value)))} aria-label="Person" className={field}>
                    {personOpts}
                  </select>
                  <span className="text-ink-3">hours</span>
                  <input value={a} onChange={(e) => edit((x) => (x.off[i][1] = digits(e.target.value)))} inputMode="numeric" aria-label="From hour" className={num} />
                  <span className="text-ink-3">to</span>
                  <input value={b} onChange={(e) => edit((x) => (x.off[i][2] = digits(e.target.value)))} inputMode="numeric" aria-label="To hour" className={num} />
                  <button onClick={() => edit((x) => x.off.splice(i, 1))} title="Remove" aria-label="Remove time off" className="grid h-[26px] w-[26px] place-items-center rounded-md text-ink-3 hover:bg-hover">
                    <Icon name="close" size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center">
                <div className="flex-1 font-semibold">Late starts</div>
                <button onClick={() => edit((x) => x.projects.length && x.late.push([0, "3"]))} className="text-[13px] font-medium underline underline-offset-2">
                  Add
                </button>
              </div>
              {d.late.length === 0 && <div className="text-[13px] text-ink-3">Every project can start at hour 0.</div>}
              {d.late.map(([j, h], i) => (
                <div key={i} className="flex flex-wrap items-center gap-1.5 text-[13px]">
                  <select value={j} onChange={(e) => edit((x) => (x.late[i][0] = Number(e.target.value)))} aria-label="Project" className={field}>
                    {d.projects.map((_, jj) => (
                      <option key={jj} value={jj}>
                        Project {projectLabel(jj)}
                      </option>
                    ))}
                  </select>
                  <span className="text-ink-3">starts at hour</span>
                  <input value={h} onChange={(e) => edit((x) => (x.late[i][1] = digits(e.target.value)))} inputMode="numeric" aria-label="Start hour" className={num} />
                  <button onClick={() => edit((x) => x.late.splice(i, 1))} title="Remove" aria-label="Remove late start" className="grid h-[26px] w-[26px] place-items-center rounded-md text-ink-3 hover:bg-hover">
                    <Icon name="close" size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3.5">
            <button onClick={() => run()} disabled={busy} className="h-10 rounded-[10px] bg-ink px-[18px] font-semibold whitespace-nowrap text-on-ink hover:opacity-[.88] disabled:opacity-60">
              {busy ? "Planning…" : "Plan with the team’s best strategy"}
            </button>
            <button
              onClick={() => {
                const ex = copy(EXAMPLE);
                setD(ex);
                run(ex);
              }}
              className="h-10 rounded-[10px] border border-line-strong bg-surface px-3.5 font-medium whitespace-nowrap hover:bg-hover"
            >
              Load the 3-person example
            </button>
            <span className="text-[12px] text-ink-3">
              {d.people.length} people · {d.projects.length} projects · {nTasks} tasks
            </span>
          </div>
        </div>

        {/* result */}
        <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-4 rounded-2xl border border-line bg-surface p-[18px]">
          {err && <div className="rounded-[10px] bg-bad-bg p-3 font-medium text-danger">{err}</div>}
          {!res && !err && <div className="text-ink-3">{busy ? "Planning…" : "Plan your team to see the calendar."}</div>}
          {res && (
            <>
              <div className="flex flex-wrap items-baseline gap-2.5">
                <span className="text-[22px] font-semibold tracking-[-0.01em]">
                  Done at hour {res.team.makespan} instead of {res.fcfs.makespan}
                </span>
                <span className="font-semibold text-ok">
                  {res.fcfs.makespan > res.team.makespan ? `${Math.round(((res.fcfs.makespan - res.team.makespan) / res.fcfs.makespan) * 100)}% sooner` : "First come, first served is already as good"}
                </span>
              </div>
              {res.fallback && (
                <div className="rounded-[10px] bg-warn-bg px-3 py-2 text-[13px] text-warn-fg">The team’s strategy could not plan this calendar, so both plans below are first come, first served.</div>
              )}
              <Gantt title="Bot team’s plan" sub={`done at hour ${res.team.makespan}`} rows={res.team.rows} people={planned.people} domain={dom} downtime={planned.downtime} marker={res.fcfs.makespan} />
              <Gantt title="First come, first served" sub={`done at hour ${res.fcfs.makespan}`} rows={res.fcfs.rows} people={planned.people} domain={dom} downtime={planned.downtime} />
              <div className="text-[12px] text-ink-3" style={{ textWrap: "pretty" }}>
                Each task starts as soon as its person and the project’s previous task are both free, outside any time off. The dashed line shows where first come, first served finishes.
                {res.strategy.id ? ` Planned with ${res.strategy.bot}’s round ${res.strategy.round} strategy${res.strategy.final ? ", the one from the final exam" : ""}.` : " No finished run yet, so this uses the best simple rule."}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
