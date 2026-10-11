"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/rally/primitives";
import { fmtK, pct } from "@/lib/board";
import { API_URL } from "@/lib/config";
import type { Results } from "@/lib/types";

const card = "rounded-2xl border border-line bg-surface";
const head = "bg-sunken border-y border-line text-[12px] font-medium text-ink-3";

function FinalCards({ r }: { r: Results }) {
  if (!r.final.length)
    return (
      <div className={`${card} flex items-start gap-3 p-[18px] text-ink-2`}>
        <Icon name="hourglass_empty" />
        <div>
          <div className="font-semibold text-ink">The final exam hasn’t run yet</div>
          It runs once, after the main run, on held-out, fresh and surprise-event instances the bots never saw: <span className="font-code text-[12px]">python -m engine.scripts.final_eval</span>
        </div>
      </div>
    );
  return (
    <>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {r.final.map((f) => (
          <div key={f.set} className={`${card} flex flex-col gap-2.5 p-[18px]`}>
            <div>
              <div className="font-semibold">{f.label}</div>
              <div className="text-[12px] text-ink-3">{f.detail}</div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-code text-[32px] leading-none font-semibold">{f.shorter_pct.toFixed(1)}%</span>
              <span className="text-ink-2">shorter schedules</span>
            </div>
            <div className="flex flex-wrap gap-x-4 text-[13px]">
              <span>
                <span className="text-ink-3">Baseline gap </span>
                <span className="font-code">{pct(f.baseline_gap, 1)}</span>
              </span>
              <span>
                <span className="text-ink-3">Bot team </span>
                <span className="font-code font-semibold">{pct(f.team_gap, 1)}</span>
              </span>
            </div>
            {f.gap_closed_pct != null && (
              <div className="flex flex-col gap-1">
                <div className="h-2 overflow-hidden rounded-full bg-hover">
                  <div className="h-full rounded-full bg-ok" style={{ width: `${Math.max(0, Math.min(100, f.gap_closed_pct))}%` }} />
                </div>
                <div className="text-[12px] text-ink-2">
                  <span className="font-semibold text-ink">{f.gap_closed_pct}%</span> of the gap closed
                  {f.gap_closed_vs_fcfs_pct != null ? ` · ${f.gap_closed_vs_fcfs_pct}% vs first come, first served` : ""}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-start gap-2 text-[13px] text-ink-2">
        <Icon name="verified" size={18} />
        <span style={{ textWrap: "pretty" }}>
          Splits and the fresh and event instances were committed to git before round 1
          {r.splits_commit ? <> (<span className="font-code text-[12px]">{r.splits_commit.slice(0, 7)}</span>)</> : null}. The final evaluation script refuses to run twice. Every run is recorded in data/final_eval.json
          {r.final_eval_ts ? `, this one on ${new Date(r.final_eval_ts).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : ""}.
        </span>
      </div>
    </>
  );
}

function RoundsTable({ r }: { r: Results }) {
  if (!r.rounds.length) return null;
  // trailing rounds with no further gain collapse into one row ("9–10")
  const rows = [...r.rounds];
  let tail = rows.length;
  while (tail > 1 && rows[tail - 1].set_by === "No further gain") tail--;
  const merged = rows.slice(0, tail).map((x) => ({ ...x, label: String(x.n) }));
  if (tail < rows.length) {
    const first = rows[tail];
    const last = rows[rows.length - 1];
    merged.push({ ...last, label: first.n === last.n ? String(first.n) : `${first.n}–${last.n}` });
  }
  const recordRound = [...rows].reverse().find((x) => x.set_by !== "No further gain")?.n;
  const m = r.main_run;
  const cols = "60px 90px 90px minmax(0,1fr)";
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="px-[18px] pt-4 pb-2.5">
        <h2 className="m-0 text-[16px] font-semibold">Improvement across rounds</h2>
        <div className="text-[12px] text-ink-3">Main run{m?.n_bots ? `, ${m.n_bots} bots` : ""}. The check set is scored every round but never shown to the bots.</div>
      </div>
      <div className={`grid ${head}`} style={{ gridTemplateColumns: cols }}>
        <span className="py-2 pl-[18px]">Round</span>
        <span className="p-2 text-right">Practice</span>
        <span className="p-2 text-right">Check</span>
        <span className="px-3 py-2">Set by</span>
      </div>
      {merged.map((x) => {
        const strong = !!x.human_message || x.n === recordRound;
        return (
          <div key={x.label} className="grid min-h-9 items-center border-b border-line" style={{ gridTemplateColumns: cols, fontWeight: strong ? 600 : 400, background: x.human_message ? "var(--warn-bg)" : undefined }}>
            <span className="py-1 pl-[18px] font-code">{x.label}</span>
            <span className="px-2 py-1 text-right font-code">{pct(x.practice)}</span>
            <span className="px-2 py-1 text-right font-code text-ink-2">{pct(x.check, 1)}</span>
            <span title={x.set_by} className="truncate px-3 py-1 text-[13px] text-ink-2">
              {x.set_by}
              {x.human_message ? `, after ${x.human_message.name}’s message` : ""}
            </span>
          </div>
        );
      })}
      {m && (
        <div className="px-[18px] py-3 text-[12px] text-ink-2">
          Main run cost: {m.calls} Luminal calls, about {fmtK(m.tokens)} tokens{m.minutes != null ? `, ${Math.round(m.minutes)} minutes` : ""}. {m.proposals_ok} of {m.proposals_total} proposals passed the safety and validity checks.
        </div>
      )}
    </div>
  );
}

function HeadToHead({ r }: { r: Results }) {
  const rows = [...r.head_to_head].sort((a, b) => a.bots - b.bots);
  if (rows.length < 2) return null;
  const [small, big] = [rows[0], rows[rows.length - 1]];
  const lines: [string, keyof (typeof rows)[number], boolean][] = [
    ["Rounds in 15 min", "rounds", false],
    ["Best @ 5 min", "at5", true],
    ["Best @ 10 min", "at10", true],
    ["Best @ 15 min", "at15", true],
    ["Check @ 15 min", "check15", true],
    ["Tokens", "tokens", false],
  ];
  const best = (k: keyof (typeof rows)[number]) => Math.min(...rows.map((x) => (typeof x[k] === "number" ? (x[k] as number) : Infinity)));
  const winner = (big.at15 ?? Infinity) <= (small.at15 ?? Infinity) ? big : small;
  const fmt = (k: string, v: unknown) => (v == null ? "–" : k === "tokens" ? fmtK(v as number) : k === "rounds" ? String(v) : `${(v as number).toFixed(2)}%`);
  return (
    <div className={`${card} flex flex-col gap-3.5 p-[18px]`}>
      <div>
        <h2 className="m-0 text-[16px] font-semibold">Do parallel agents find better solutions faster?</h2>
        <div className="text-[12px] text-ink-3">Same 15-minute budget, no human steering, run one after the other on the same machine.</div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[small, big].map((t) => (
          <div key={t.bots} className="flex flex-col gap-1.5 rounded-xl border p-3" style={{ borderColor: t === winner ? "var(--ink)" : "var(--line)", background: t === winner ? "var(--sunken)" : undefined }}>
            <div className="font-semibold">{t.bots} bots</div>
            {lines.map(([label, k, lowerWins]) => (
              <div key={label} className="flex justify-between gap-2 text-[13px]">
                <span className="text-ink-3">{label}</span>
                <span className="font-code" style={{ fontWeight: lowerWins && t[k] === best(k) ? 600 : 400 }}>
                  {fmt(String(k), t[k])}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <ul className="m-0 flex flex-col gap-1 pl-[18px] text-[13px] text-ink-2">
        {big.at15 != null && small.at15 != null && (
          <li>
            After 15 minutes the {winner.bots}-bot team was ahead: {winner.at15!.toFixed(2)}% vs {(winner === big ? small : big).at15!.toFixed(2)}% behind best known.
          </li>
        )}
        <li>
          Tokens used: {fmtK(big.tokens)} for {big.bots} bots vs {fmtK(small.tokens)} for {small.bots}.
        </li>
        {small.at5 != null && (big.at5 == null || small.at5 < big.at5) && <li>The trade-off: a wider round takes longer, so the small team leads for the first few minutes.</li>}
      </ul>
    </div>
  );
}

function TeamSize({ r }: { r: Results }) {
  if (!r.team_size.length) return null;
  const cols = "70px 1fr 1.4fr 1fr";
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="px-[18px] pt-4 pb-2.5">
        <h2 className="m-0 text-[16px] font-semibold">Does team size matter?</h2>
        <div className="text-[12px] text-ink-3">Same number of rounds for every size. Mean of the best practice gap per run.</div>
      </div>
      <div className={`grid ${head}`} style={{ gridTemplateColumns: cols }}>
        <span className="py-2 pl-[18px]">Bots</span>
        <span className="p-2 text-right">Practice</span>
        <span className="p-2 text-right">Range</span>
        <span className="py-2 pr-[18px] pl-2 text-right">Check</span>
      </div>
      {r.team_size.map((s) => (
        <div key={s.bots} className="grid min-h-9 items-center border-b border-line font-code text-[13px]" style={{ gridTemplateColumns: cols }}>
          <span className="py-1 pl-[18px]">{s.bots}</span>
          <span className="px-2 py-1 text-right">{pct(s.practice_mean)}</span>
          <span className="px-2 py-1 text-right text-ink-2">
            {s.lo.toFixed(2)} – {s.hi.toFixed(2)}
          </span>
          <span className="py-1 pr-[18px] pl-2 text-right text-ink-2">{pct(s.check_mean)}</span>
        </div>
      ))}
      <div className="px-[18px] py-3 text-[12px] text-ink-2">
        {r.team_size[0].runs} runs per size. With this few runs, small differences between sizes are within the noise.
      </div>
    </div>
  );
}

function Approaches({ r }: { r: Results }) {
  if (!r.approaches.length) return null;
  const cols = "minmax(260px,2fr) minmax(150px,1fr) 120px 150px";
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="px-[18px] pt-4 pb-2.5">
        <h2 className="m-0 text-[16px] font-semibold">Meaningfully different approaches</h2>
        <div className="text-[12px] text-ink-3">
          {r.main_run ? `${r.main_run.proposals_total} proposals over ${r.main_run.rounds} rounds. ` : ""}The chief of staff gives every bot a different change each round.
        </div>
      </div>
      <div className="overflow-auto">
        <div className={`grid min-w-[720px] ${head}`} style={{ gridTemplateColumns: cols }}>
          <span className="px-[18px] py-2">Approach</span>
          <span className="p-2">First tried</span>
          <span className="p-2 text-right">Best result</span>
          <span className="py-2 pr-[18px] pl-3">Fate</span>
        </div>
        {r.approaches.map((a) => {
          const avoid = a.fate === "AVOID";
          const win = a.fate === "Final strategy" || a.fate === "Backbone";
          return (
            <div key={a.family} className="grid min-h-[38px] min-w-[720px] items-center border-b border-line" style={{ gridTemplateColumns: cols, fontWeight: win ? 600 : 400 }}>
              <span className="px-[18px] py-1">{a.family}</span>
              <span className="px-2 py-1 text-[13px] text-ink-2">{a.first_tried}</span>
              <span className="px-2 py-1 text-right font-code text-[13px]">{a.best}</span>
              <span className="py-1 pr-[18px] pl-3">
                <span
                  className="rounded-[5px] px-[7px] py-0.5 text-[11px] font-semibold whitespace-nowrap"
                  style={{ background: avoid ? "var(--bad-bg)" : win ? "var(--ink)" : "var(--hover)", color: avoid ? "var(--danger)" : win ? "var(--on-ink)" : "var(--ink-2)" }}
                >
                  {a.fate}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ResultsScreen() {
  const [r, setR] = useState<Results | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    fetch(`${API_URL}/api/results`, { cache: "no-store" })
      .then((x) => (x.ok ? x.json() : Promise.reject()))
      .then(setR)
      .catch(() => setErr(true));
  }, []);

  const m = r?.main_run;
  return (
    <section className="mx-auto flex max-w-[1180px] flex-col gap-7 px-6 pt-7 pb-14">
      <div>
        <h1 className="m-0 text-[26px] font-semibold tracking-[-0.01em]">Final score on tests the bots never saw</h1>
        <div className="max-w-[72ch] text-ink-2" style={{ textWrap: "pretty" }}>
          The best strategy from the main run{m ? ` (${m.n_bots} bots, ${m.rounds} rounds)` : ""}, run once by final_eval.py with {r?.repeats ?? 3} runs per instance. Each strategy gets {r?.time_limit ?? 2} seconds per instance on 1 CPU thread. Gap means how much later the schedule finishes than the reference.
        </div>
      </div>
      {err && <div className="rounded-xl bg-bad-bg p-3 font-medium text-danger">Can’t load the results from the engine.</div>}
      {!r && !err && <div className="text-ink-3">Loading…</div>}
      {r && (
        <>
          <FinalCards r={r} />
          <div className="grid items-start gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))" }}>
            <RoundsTable r={r} />
            <div className="flex flex-col gap-5">
              <HeadToHead r={r} />
              <TeamSize r={r} />
            </div>
          </div>
          <Approaches r={r} />
        </>
      )}
    </section>
  );
}
