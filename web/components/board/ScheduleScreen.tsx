"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import TeamCalendar from "@/components/TeamCalendar";
import { Icon, Segmented } from "@/components/rally/primitives";
import { projectFill, projectLabel } from "@/lib/board";
import { API_URL } from "@/lib/config";
import type { ScheduleInput, TeamSchedule } from "@/lib/types";
import { who } from "@/lib/words";
import { DAY_START, fmtWhen, workHourToDate } from "@/lib/worktime";
import { useBoard } from "./BoardProvider";
import Gantt from "./Gantt";

type Draft = {
  people: string[];
  projects: { name: string; tasks: [number, string][] }[]; // [person, hours] per task, in order
  off: [number, string, string][]; // person, from, to
  late: [number, string][]; // project, hour
};

const EXAMPLE: Draft = {
  people: ["Ana", "Ben", "Cai"],
  projects: [
    { name: "Project A", tasks: [[1, "5"], [2, "1"], [0, "3"]] },
    { name: "Project B", tasks: [[0, "1"], [2, "3"], [1, "1"]] },
    { name: "Project C", tasks: [[0, "1"], [2, "4"], [1, "5"]] },
  ],
  off: [],
  late: [],
};
const copy = (d: Draft): Draft => JSON.parse(JSON.stringify(d));
const digits = (v: string, n = 4) => v.replace(/[^0-9]/g, "").slice(0, n);

/** The shared plan's input back into the form. */
function fromInput(inp: ScheduleInput): Draft {
  const people: string[] = [];
  const names: string[] = [];
  const projects: Draft["projects"] = [];
  const pi = (p: string) => (people.includes(p) ? people.indexOf(p) : people.push(p) - 1);
  for (const t of inp.tasks) {
    if (!names.includes(t.project)) {
      names.push(t.project);
      projects.push({ name: t.project, tasks: [] });
    }
    projects[names.indexOf(t.project)].tasks.push([pi(t.person), String(t.hours)]);
  }
  return {
    people,
    projects,
    off: inp.downtime.filter((o) => people.includes(o.person)).map((o) => [people.indexOf(o.person), String(o.start), String(o.end)]),
    late: inp.release.filter((r) => names.includes(r.project)).map((r) => [names.indexOf(r.project), String(r.at)]),
  };
}

function toInput(d: Draft): ScheduleInput {
  return {
    tasks: d.projects.flatMap((p) => p.tasks.map(([m, h]) => ({ project: p.name.trim(), person: d.people[m], hours: Math.max(1, Number(h) || 1) }))),
    downtime: d.off.filter(([, a, b]) => Number(b) > Number(a)).map(([m, a, b]) => ({ person: d.people[m], start: Number(a), end: Number(b) })),
    release: d.late.map(([j, h]) => ({ project: d.projects[j].name.trim(), at: Number(h) || 0 })),
  };
}

// survives moving between screens; `dirty` keeps your edits when someone else plans a team
let memo: { draft: Draft; dirty: boolean } | null = null;

const field = "h-[30px] rounded-lg border border-line-strong bg-bg px-1.5 outline-none";
const num = `${field} w-11 text-right font-code`;

export default function ScheduleScreen() {
  const { teamKey } = useBoard();
  const [d, setD] = useState<Draft>(() => memo?.draft ?? copy(EXAMPLE));
  const dirty = useRef(memo?.dirty ?? false);
  const [res, setRes] = useState<TeamSchedule | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"hours" | "week">("hours");
  const [newPerson, setNewPerson] = useState("");

  useEffect(() => {
    memo = { draft: d, dirty: dirty.current };
  }, [d]);

  const edit = (fn: (x: Draft) => void) => {
    dirty.current = true;
    setD((cur) => {
      const x = copy(cur);
      fn(x);
      return x;
    });
  };

  const submit = useCallback(async (draft: Draft) => {
    if (!draft.people.length) return setErr("Add at least one person.");
    if (!draft.projects.length) return setErr("Add at least one project.");
    const empty = draft.projects.findIndex((p) => !p.tasks.length);
    if (empty >= 0) return setErr(`${draft.projects[empty].name || `Project ${projectLabel(empty)}`} has no tasks. Add one or remove the project.`);
    const names = draft.projects.map((p) => p.name.trim().toLowerCase());
    if (names.some((n) => !n)) return setErr("Every project needs a name.");
    if (new Set(names).size < names.length) return setErr("Two projects have the same name.");
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`${API_URL}/api/schedule`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(toInput(draft)) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail[0].toUpperCase() + j.detail.slice(1) : "The planner could not read this team. Check the hours.");
      setRes(j);
      dirty.current = false;
    } catch (e) {
      setErr(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Can’t reach the engine.");
    } finally {
      setBusy(false);
    }
  }, []);

  // the latest plan is shared: load it (and again whenever anyone plans one); the very first visit plans the example
  useEffect(() => {
    fetch(`${API_URL}/api/team-schedule`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: TeamSchedule | null) => {
        if (!j) return submit(EXAMPLE);
        setRes(j);
        if (!dirty.current) setD(fromInput(j.input));
      })
      .catch(() => setErr("Can’t reach the engine."));
  }, [teamKey, submit]);

  const addPerson = () => {
    const v = newPerson.trim().slice(0, 24);
    if (!v || d.people.length >= 30 || d.people.some((p) => p.toLowerCase() === v.toLowerCase())) return;
    edit((x) => x.people.push(v));
    setNewPerson("");
  };
  const removePerson = (i: number) =>
    edit((x) => {
      if (x.people.length <= 1) return;
      x.people.splice(i, 1);
      const shift = (m: number) => (m > i ? m - 1 : m);
      x.projects = x.projects.map((p) => ({ ...p, tasks: p.tasks.filter(([m]) => m !== i).map(([m, h]) => [shift(m), h] as [number, string]) }));
      x.off = x.off.filter(([m]) => m !== i).map(([m, a, b]) => [shift(m), a, b] as [number, string, string]);
    });
  const removeProject = (j: number) =>
    edit((x) => {
      x.projects.splice(j, 1);
      x.late = x.late.filter(([p]) => p !== j).map(([p, h]) => [p > j ? p - 1 : p, h] as [number, string]);
    });
  const addProject = () =>
    edit((x) => {
      if (x.projects.length >= 26) return;
      let n = x.projects.length;
      while (x.projects.some((p) => p.name === `Project ${projectLabel(n)}`)) n++;
      x.projects.push({ name: `Project ${projectLabel(n)}`, tasks: x.people.map((_, i) => [i, "2"] as [number, string]) });
    });

  const nTasks = d.projects.reduce((a, p) => a + p.tasks.length, 0);
  const personOpts = d.people.map((p, i) => (
    <option key={i} value={i}>
      {p}
    </option>
  ));
  const dom = res ? Math.max(res.fcfs.makespan, res.bot.makespan, 1) : 1;
  const when = (h: number) => (res ? fmtWhen(workHourToDate(res.start, h, res.hours_per_day)) : "");

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
              <button onClick={addProject} className="inline-flex h-[30px] items-center gap-1 rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] font-medium whitespace-nowrap hover:bg-hover">
                <Icon name="add" size={17} />
                Project
              </button>
            </div>
            {d.projects.map((p, j) => (
              <div key={j} className="flex flex-col gap-2 rounded-xl border border-line px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-5 w-5 flex-none rounded-[5px]" style={{ background: projectFill(j) }} />
                  <input
                    value={p.name}
                    onChange={(e) => edit((x) => (x.projects[j].name = e.target.value.slice(0, 40)))}
                    aria-label="Project name"
                    className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 font-semibold outline-none hover:border-line focus:border-line-strong"
                  />
                  <button onClick={() => removeProject(j)} title="Remove project" aria-label={`Remove ${p.name}`} className="grid h-7 w-7 place-items-center rounded-[7px] text-ink-3 hover:bg-hover hover:text-ink">
                    <Icon name="delete" size={18} />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {p.tasks.map(([m, h], k) => (
                    <span key={k} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong bg-bg pr-1 pl-2">
                      <span className="font-code text-[11px] text-ink-3">{k + 1}</span>
                      <select value={m} onChange={(e) => edit((x) => (x.projects[j].tasks[k][0] = Number(e.target.value)))} aria-label="Person" className="border-0 bg-transparent text-[13px] font-medium">
                        {personOpts}
                      </select>
                      <input
                        value={h}
                        onChange={(e) => edit((x) => (x.projects[j].tasks[k][1] = digits(e.target.value, 3)))}
                        inputMode="numeric"
                        aria-label="Hours"
                        className="h-6 w-[34px] border-0 border-l border-line bg-transparent text-right font-code text-[12px] outline-none"
                      />
                      <span className="text-[11px] text-ink-3">h</span>
                      <button onClick={() => edit((x) => x.projects[j].tasks.splice(k, 1))} title="Remove task" aria-label="Remove task" className="grid h-[22px] w-[22px] place-items-center rounded-md text-ink-3 hover:bg-hover">
                        <Icon name="close" size={15} />
                      </button>
                    </span>
                  ))}
                  <button
                    onClick={() => edit((x) => x.projects[j].tasks.length < 30 && x.projects[j].tasks.push([x.projects[j].tasks.length % Math.max(1, x.people.length), "2"]))}
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
                    {d.projects.map((p, jj) => (
                      <option key={jj} value={jj}>
                        {p.name}
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
            <button onClick={() => submit(d)} disabled={busy} className="h-10 rounded-[10px] bg-ink px-[18px] font-semibold whitespace-nowrap text-on-ink hover:opacity-[.88] disabled:opacity-60">
              {busy ? "Planning…" : "Plan with the team’s best strategy"}
            </button>
            <button
              onClick={() => {
                const ex = copy(EXAMPLE);
                dirty.current = true;
                setD(ex);
                submit(ex);
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

        {/* result: the latest plan, shared by everyone watching */}
        <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-4 rounded-2xl border border-line bg-surface p-[18px]">
          {err && <div className="rounded-[10px] bg-bad-bg p-3 font-medium text-danger">{err}</div>}
          {!res && !err && <div className="text-ink-3">{busy ? "Planning…" : "Loading the latest plan…"}</div>}
          {res && (
            <>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-[240px] flex-1">
                  <div className="flex flex-wrap items-baseline gap-2.5">
                    <span className="text-[22px] font-semibold tracking-[-0.01em]">
                      Done at hour {res.bot.makespan} instead of {res.fcfs.makespan}
                    </span>
                    <span className="font-semibold text-ok">{res.hours_saved > 0 ? `${Math.round(res.pct_shorter)}% sooner` : "First come, first served is already as good"}</span>
                  </div>
                  <div className="text-[13px] text-ink-2">
                    Finishes <span className="font-code text-[12px] text-ink">{when(res.bot.makespan)}</span>
                    {res.hours_saved > 0 && (
                      <>
                        {" "}
                        instead of <span className="font-code text-[12px]">{when(res.fcfs.makespan)}</span>
                      </>
                    )}
                    , working days {DAY_START}:00–{DAY_START + res.hours_per_day}:00.
                  </div>
                </div>
                <Segmented
                  small
                  options={[
                    ["hours", "Hours"],
                    ["week", "Week"],
                  ]}
                  value={view}
                  onChange={setView}
                />
              </div>
              {view === "hours" ? (
                <>
                  <Gantt title="Bot team’s plan" sub={`done at hour ${res.bot.makespan}`} rows={res.bot.rows} people={res.people} domain={dom} downtime={res.bot.downtime} marker={res.fcfs.makespan} />
                  <Gantt title="First come, first served" sub={`done at hour ${res.fcfs.makespan}`} rows={res.fcfs.rows} people={res.people} domain={dom} downtime={res.fcfs.downtime} />
                </>
              ) : (
                <TeamCalendar key={res.ts} plan={res.bot} people={res.people} projects={res.projects} start={res.start} hoursPerDay={res.hours_per_day} compareEnd={res.fcfs.makespan} />
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                {res.projects.slice(0, 26).map((p, j) => (
                  <span key={p} className="inline-flex items-center gap-1.5">
                    <span className="grid h-4 w-4 place-items-center rounded-[4px] text-[9px] font-semibold text-bar-ink" style={{ background: projectFill(j) }}>
                      {view === "hours" ? projectLabel(j) : ""}
                    </span>
                    {p}
                  </span>
                ))}
              </div>
              <div className="text-[12px] text-ink-3" style={{ textWrap: "pretty" }}>
                Each task starts as soon as its person and the project’s previous task are both free, outside any time off.{" "}
                {view === "hours" ? "The dashed line shows where first come, first served finishes. " : ""}
                {res.kept_simple ? "The strategy found nothing better here, so this is the first come, first served plan. " : ""}
                Planned with {who(res.strategy.bot)}’s strategy. Everyone watching sees the latest plan.
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
