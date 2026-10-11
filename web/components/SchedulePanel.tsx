"use client";

import { useCallback, useEffect, useState } from "react";
import TeamCalendar, { projectColor } from "@/components/TeamCalendar";
import { API_URL } from "@/lib/config";
import type { Showcase } from "@/lib/types";
import { fmtWhen, workHourToDate } from "@/lib/worktime";

type TeamSchedule = {
  ts: string;
  start: string;
  hours_per_day: number;
  input: Parsed;
  people: string[];
  projects: string[];
  fcfs: Showcase;
  bot: Showcase;
  hours_saved: number;
  pct_shorter: number;
  kept_simple: boolean;
  strategy: { id: string; bot: string };
};

type Parsed = {
  tasks: { project: string; person: string; hours: number }[];
  downtime: { person: string; start: number; end: number }[];
  release: { project: string; at: number }[];
};

const EXAMPLE = `# One task per line, in order within each project:
# project, person, hours
Website, Ben, 5
Website, Cai, 1
Website, Ana, 3
Billing, Ana, 1
Billing, Cai, 3
Billing, Ben, 1
Mobile app, Ana, 1
Mobile app, Cai, 4
Mobile app, Ben, 5

# Optional:
# off: person, from hour, to hour   (someone is out; hours count from the plan's start)
# late: project, hour               (a project can't start before)
`;

function parse(text: string): Parsed {
  const out: Parsed = { tasks: [], downtime: [], release: [] };
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const lower = line.toLowerCase();
    const cells = (s: string) => s.split(",").map((c) => c.trim());
    const num = (s: string, what: string) => {
      const n = Number(s);
      if (!Number.isInteger(n)) throw new Error(`line ${i + 1}: ${what} must be a whole number`);
      return n;
    };
    if (lower.startsWith("off:")) {
      const [person, start, end] = cells(line.slice(4));
      if (!person || start == null || end == null) throw new Error(`line ${i + 1}: use "off: person, from, to"`);
      out.downtime.push({ person, start: num(start, "from"), end: num(end, "to") });
    } else if (lower.startsWith("late:")) {
      const [project, at] = cells(line.slice(5));
      if (!project || at == null) throw new Error(`line ${i + 1}: use "late: project, hour"`);
      out.release.push({ project, at: num(at, "hour") });
    } else {
      const [project, person, hours] = cells(line);
      if (!project || !person || hours == null) throw new Error(`line ${i + 1}: use "project, person, hours"`);
      out.tasks.push({ project, person, hours: num(hours, "hours") });
    }
  });
  return out;
}

function toText(p: Parsed): string {
  const lines = ["# project, person, hours", ...p.tasks.map((t) => `${t.project}, ${t.person}, ${t.hours}`)];
  p.downtime.forEach((d) => lines.push(`off: ${d.person}, ${d.start}, ${d.end}`));
  p.release.forEach((r) => lines.push(`late: ${r.project}, ${r.at}`));
  return lines.join("\n") + "\n";
}

function workSpan(hours: number, perDay: number) {
  const d = Math.floor(hours / perDay);
  const h = hours % perDay;
  return [d ? `${d} working day${d > 1 ? "s" : ""}` : "", h ? `${h} h` : ""].filter(Boolean).join(" ") || "0 h";
}

// The board's calendar: the latest team schedule (shared by every viewer via MongoDB), and the editor.
export default function SchedulePanel({ refreshKey }: { refreshKey: number }) {
  const [sched, setSched] = useState<TeamSchedule | null>(null);
  const [view, setView] = useState<"bot" | "fcfs">("bot");
  const [text, setText] = useState(EXAMPLE);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async (body: Parsed) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API_URL}/api/schedule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail : "check the input format");
      setSched(j);
      setView("bot");
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  // load the shared latest schedule; first ever visit schedules the example team
  useEffect(() => {
    fetch(`${API_URL}/api/team-schedule`)
      .then((r) => r.json())
      .then((j: TeamSchedule | null) => {
        if (j) setSched(j);
        else submit(parse(EXAMPLE));
      })
      .catch(() => setError("can't reach the engine"));
  }, [refreshKey, submit]);

  const run = () => {
    try {
      submit(parse(text));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const plan = sched && (view === "bot" ? sched.bot : sched.fcfs);
  const other = sched && (view === "bot" ? sched.fcfs : sched.bot);
  const done = sched && workHourToDate(sched.start, sched.bot.makespan, sched.hours_per_day);
  const simpleDone = sched && workHourToDate(sched.start, sched.fcfs.makespan, sched.hours_per_day);

  return (
    <section className="panel p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg">Your team&apos;s calendar</h2>
          {sched && done && simpleDone && (
            <div className="text-sm mt-0.5">
              {sched.hours_saved > 0 ? (
                <>
                  The bots&apos; plan is done <span className="text-blue num">{fmtWhen(done)}</span>,{" "}
                  <span className="text-good num">{workSpan(sched.hours_saved, sched.hours_per_day)} sooner</span> than first come, first served (
                  <span className="num">{fmtWhen(simpleDone)}</span>).
                </>
              ) : (
                <>
                  Done <span className="text-blue num">{fmtWhen(done)}</span>. {sched.kept_simple ? "The simple order was already the best found here." : "Already as short as it gets."}
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2 text-sm">
          {(["bot", "fcfs"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1 rounded-md border ${view === v ? "border-blue text-blue" : "border-navy-600 text-ink-dim"}`}>
              {v === "bot" ? "bots' plan" : "first come, first served"}
            </button>
          ))}
          <button
            onClick={() => {
              if (!editing && sched) setText(toText(sched.input));
              setEditing(!editing);
            }}
            className="px-3 py-1 rounded-md border border-navy-600"
          >
            {editing ? "close editor" : "edit team"}
          </button>
        </div>
      </div>

      {editing && (
        <div className="flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            spellCheck={false}
            className="num text-xs bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 outline-none focus:border-blue resize-y"
          />
          <div className="flex gap-2 items-center">
            <button onClick={run} disabled={busy} className="bg-blue text-white rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50">
              {busy ? "Scheduling…" : "Schedule it"}
            </button>
            <button onClick={() => setText(EXAMPLE)} className="border border-navy-600 rounded-lg px-3 py-1.5 text-sm text-ink-dim">
              example team
            </button>
            <span className="text-xs text-ink-dim">Uses the bot team&apos;s best strategy; everyone watching sees the new calendar.</span>
          </div>
        </div>
      )}
      {error && <div className="text-bad text-sm">{error}</div>}

      {sched && plan && other ? (
        <>
          <TeamCalendar
            key={sched.ts}
            plan={plan}
            people={sched.people}
            projects={sched.projects}
            start={sched.start}
            hoursPerDay={sched.hours_per_day}
            compareEnd={view === "bot" ? other.makespan : undefined}
            compareLabel="first come, first served"
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-dim">
            {sched.projects.slice(0, 20).map((p, j) => (
              <span key={p} className="flex items-center gap-1.5 text-ink">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: projectColor(j) }} />
                {p}
              </span>
            ))}
            <span>· working days 9:00–17:00 · striped = out of office · hover a task for details</span>
          </div>
        </>
      ) : (
        !error && <div className="text-sm text-ink-dim">Scheduling the example team…</div>
      )}
    </section>
  );
}
