"use client";

import { useState } from "react";
import Calendar from "@/components/Calendar";
import { API_URL } from "@/lib/config";
import type { Showcase } from "@/lib/types";

type Result = {
  people: string[];
  projects: string[];
  fcfs: Showcase;
  bot: Showcase;
  hours_saved: number;
  pct_shorter: number;
  kept_simple: boolean;
  strategy: { id: string; bot: string };
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
# off: person, from hour, to hour     (someone is out)
# late: project, hour                 (a project can't start before)
`;

type Parsed = {
  tasks: { project: string; person: string; hours: number }[];
  downtime: { person: string; start: number; end: number }[];
  release: { project: string; at: number }[];
};

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

export default function SchedulePanel() {
  const [text, setText] = useState(EXAMPLE);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0); // fresh calendars per result, so no stale "previous finish" line

  const run = async () => {
    setError(null);
    let body: Parsed;
    try {
      body = parse(text);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/schedule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail : "check the input format");
      setResult(j);
      setNonce((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="font-semibold">Schedule your team</h2>
        <span className="text-xs text-ink-dim">uses the bot team&apos;s best strategy · about 2 seconds</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_1fr] gap-4">
        <div className="flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={16}
            spellCheck={false}
            className="num text-xs bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 outline-none focus:border-blue resize-y"
          />
          <div className="flex gap-2">
            <button onClick={run} disabled={busy} className="bg-blue text-white rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50">
              {busy ? "Scheduling…" : "Schedule it"}
            </button>
            <button onClick={() => { setText(EXAMPLE); setResult(null); setError(null); }} className="border border-navy-600 rounded-lg px-3 py-1.5 text-sm text-ink-dim">
              reset example
            </button>
          </div>
          {error && <div className="text-bad text-sm">{error}</div>}
        </div>

        <div className="flex flex-col gap-3 min-w-0">
          {!result ? (
            <div className="text-sm text-ink-dim">
              List each project&apos;s tasks in order, with who does them and for how long. The bots&apos; schedule is compared with first come, first served:
              everyone handling tasks in the order the projects are listed.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                <div className="num">
                  <span className="text-3xl text-blue">{result.bot.makespan}h</span>
                  <span className="text-ink-dim text-sm"> vs {result.fcfs.makespan}h first come, first served</span>
                </div>
                {result.hours_saved > 0 ? (
                  <div className="num text-good">
                    {result.hours_saved}h sooner ({result.pct_shorter}% shorter)
                  </div>
                ) : (
                  <div className="text-sm text-ink-dim">
                    {result.kept_simple ? "The simple order was already the best we found here." : "Already as short as it gets for this plan."}
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs text-ink-dim mb-1">Bot team&apos;s schedule ({result.strategy.bot}&apos;s strategy)</div>
                <Calendar key={`b${nonce}`} showcase={result.bot} baselineMakespan={result.fcfs.makespan} rowLabels={result.people} jobLabels={result.projects} />
              </div>
              <div>
                <div className="text-xs text-ink-dim mb-1">First come, first served</div>
                <Calendar key={`f${nonce}`} showcase={result.fcfs} rowLabels={result.people} jobLabels={result.projects} />
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                {result.projects.map((p, j) => (
                  <span key={p} className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: `hsl(${(j * 137.508) % 360} 70% 58%)` }} />
                    {p}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
