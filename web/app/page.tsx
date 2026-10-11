"use client";

import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import BotGrid, { type LiveBot } from "@/components/BotGrid";
import Calendar from "@/components/Calendar";
import SchedulePanel from "@/components/SchedulePanel";
import ScoreChart from "@/components/ScoreChart";
import StrategyModal from "@/components/StrategyModal";
import { API_URL, APP_NAME } from "@/lib/config";
import type { LiveEvent, State } from "@/lib/types";

const NAME_KEY = "botteam:name";

function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function fmt(n: number | undefined | null) {
  if (n == null) return "0";
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

function describe(e: LiveEvent): string | null {
  const d = e.data as Record<string, unknown>;
  const g = (v: unknown) => (typeof v === "number" ? `${v.toFixed(2)}%` : "–");
  switch (e.type) {
    case "round_started":
      return `Round ${d.n} started`;
    case "round_finished":
      return d.error ? `Run stopped: ${d.error}` : `Round ${d.n} done: round best ${g(d.best_practice_gap)}, team best ${g(d.best_ever_practice_gap)}`;
    case "scored":
      return `${e.bot} scored ${g(d.practice_gap)}`;
    case "fired":
      return `${e.bot} was let go (${d.reason})`;
    case "hired":
      return `${e.bot} joined the team${d.angle ? `: ${d.angle}` : ""}`;
    case "rejected":
      return d.final ? `${e.bot} sat out: ${String(d.error ?? "").slice(0, 90)}` : `${e.bot} retrying after an error`;
    case "lesson":
      return "Playbook updated";
    case "paused":
      return "Run paused";
    case "resumed":
      return "Run resumed";
    case "final_result":
      return "Final result recorded";
    default:
      return null;
  }
}

export default function Board() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [nameReady, setNameReady] = useState(false);
  const [live, setLive] = useState<Record<string, LiveBot>>({});
  const [activity, setActivity] = useState<{ id: string; text: string; ts: string }[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [msgBot, setMsgBot] = useState("");
  const [connected, setConnected] = useState(false);
  const [admin, setAdmin] = useState<string | null>(null);
  const [boardUrl, setBoardUrl] = useState("");
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runIdRef = useRef<string | null>(null); // only show live events for the run on screen

  const fetchState = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/state`, { cache: "no-store" });
      const st: State = await r.json();
      runIdRef.current = st.run?._id ?? null;
      setState(st);
      setError(null);
    } catch {
      setError("can't reach the engine");
    }
  }, []);

  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(fetchState, 400);
  }, [fetchState]);

  useEffect(() => {
    setName(readName());
    setNameReady(true);
    setBoardUrl(window.location.origin + window.location.pathname);
    setAdmin(new URLSearchParams(window.location.search).get("admin"));
    fetchState();
  }, [fetchState]);

  // live events
  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      es = new EventSource(`${API_URL}/api/stream`);
      es.onopen = () => {
        setConnected(true);
        fetchState(); // on (re)connect, refetch the whole state
      };
      es.onerror = () => {
        setConnected(false);
        es?.close();
        retry = setTimeout(connect, 2000);
      };
      es.onmessage = (m) => {
        const e: LiveEvent = JSON.parse(m.data);
        // background experiments (tagged runs) write events too; a new board-started run is picked up via refetch
        if (e.run_id && runIdRef.current && e.run_id !== runIdRef.current) {
          if (e.type === "round_started" || e.type === "hired") scheduleRefetch();
          return;
        }
        const d = e.data as Record<string, unknown>;
        if (e.bot) {
          setLive((prev) => {
            const cur = prev[e.bot!] ?? { status: "waiting" };
            switch (e.type) {
              case "assignment":
                return { ...prev, [e.bot!]: { status: "thinking", change: String(d.change ?? "") } };
              case "proposal":
                return { ...prev, [e.bot!]: { ...cur, status: "testing" } };
              case "rejected":
                return { ...prev, [e.bot!]: { ...cur, status: d.final ? "sat out" : "retrying", error: String(d.error ?? "") } };
              case "scored":
                return { ...prev, [e.bot!]: { ...cur, status: "scored", gap: d.practice_gap as number, delta: (d.delta as number) ?? null } };
              case "fired":
                return { ...prev, [e.bot!]: { ...cur, status: "fired" } };
              default:
                return prev;
            }
          });
        }
        if (e.type === "round_started") setLive({});
        const text = describe(e);
        if (text) setActivity((a) => [{ id: e._id, text, ts: e.ts }, ...a].slice(0, 40));
        if (["round_finished", "hired", "fired", "lesson", "human_message", "scored", "round_started", "paused", "resumed"].includes(e.type)) scheduleRefetch();
      };
    };
    connect();
    return () => {
      es?.close();
      if (retry) clearTimeout(retry);
    };
  }, [fetchState, scheduleRefetch]);

  // presence heartbeat
  useEffect(() => {
    if (!name) return;
    const beat = () =>
      fetch(`${API_URL}/api/presence`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }).catch(() => {});
    beat();
    const t = setInterval(beat, 10_000);
    return () => clearInterval(t);
  }, [name]);

  const send = async () => {
    const text = msg.trim();
    if (!text) return;
    setMsg("");
    await fetch(`${API_URL}/api/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, text, bot: msgBot || null }),
    }).catch(() => setError("message not sent"));
  };

  const control = async (action: "start" | "pause" | "resume" | "stop", body?: object) => {
    const r = await fetch(`${API_URL}/api/run/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": admin ?? "" },
      body: JSON.stringify(body ?? {}),
    });
    if (!r.ok) setError(`${action}: ${(await r.json().catch(() => ({}))).detail ?? r.status}`);
    else scheduleRefetch();
  };

  const run = state?.run;
  const bots = state?.bots ?? [];
  const activeBots = bots.filter((b) => b.status === "active");
  const bestId = state?.round?.best_ever_id;
  const bestBot = state?.round?.leaderboard?.find((l) => l.id === bestId)?.bot;
  const fcfs = state?.baselines?.fcfs;
  const curve = state?.curve ?? [];
  const firstGap = curve[0]?.best_ever;
  const nowGap = state?.round?.best_ever_practice_gap;

  if (nameReady && !name) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <form
          className="panel p-6 w-full max-w-sm flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const n = nameDraft.trim().slice(0, 40);
            if (!n) return;
            try {
              localStorage.setItem(NAME_KEY, n);
            } catch {}
            setName(n);
          }}
        >
          <div className="text-2xl font-semibold">{APP_NAME}</div>
          <div className="text-ink-dim text-sm">A team of AI bots is optimizing a schedule live. What should we call you?</div>
          <input autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Your name" className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 outline-none focus:border-blue" />
          <button className="bg-blue text-white rounded-lg py-2 font-medium">Join</button>
        </form>
      </main>
    );
  }

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-4 flex flex-col gap-4">
      {/* header */}
      <header className="panel px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full ${connected ? "bg-good" : "bg-bad"}`} title={connected ? "live" : "reconnecting"} />
          <span className="text-xl font-semibold">{state?.app_name ?? APP_NAME}</span>
        </div>
        <div className="num text-sm">
          <span className="text-ink-dim">round </span>
          <span className="text-lg">{state?.round?.n ?? "–"}</span>
          {run && <span className="text-ink-dim"> / {run.rounds_planned}</span>}
          {run && <span className={`ml-2 text-xs uppercase ${run.paused ? "text-warn" : run.status === "running" ? "text-good" : "text-ink-dim"}`}>{run.paused ? "paused" : run.status}</span>}
        </div>
        {nowGap != null && (
          <div className="num text-sm">
            <span className="text-ink-dim">team best </span>
            <span className="text-lg text-blue">{nowGap.toFixed(2)}%</span>
            {firstGap != null && fcfs && <span className="text-ink-dim"> (FCFS {fcfs.practice.toFixed(1)}%)</span>}
          </div>
        )}
        <div className="flex gap-5 num text-sm ml-auto">
          <span>
            <span className="text-ink-dim">Luminal calls </span>
            {fmt(state?.usage?.calls)}
          </span>
          <span>
            <span className="text-ink-dim">tokens </span>
            {fmt((state?.usage?.tokens_in ?? 0) + (state?.usage?.tokens_out ?? 0))}
          </span>
          <span>
            <span className="text-ink-dim">tests run </span>
            {fmt(state?.tests_run)}
          </span>
          <span title={(state?.people ?? []).join(", ")}>
            <span className="text-ink-dim">watching </span>
            {state?.people?.length ?? 0}
          </span>
        </div>
      </header>

      {error && <div className="text-bad text-sm">{error}</div>}

      {admin && (
        <div className="panel px-4 py-2 flex gap-2 items-center text-sm">
          <span className="text-ink-dim">admin</span>
          <button className="border border-navy-600 rounded px-3 py-1" onClick={() => control("start", { n_bots: 4, rounds: 10 })}>start 4 bots · 10 rounds</button>
          <button className="border border-navy-600 rounded px-3 py-1" onClick={() => control("start", { n_bots: 8, rounds: 10 })}>start 8 bots · 10 rounds</button>
          <button className="border border-navy-600 rounded px-3 py-1" onClick={() => control("pause")}>pause</button>
          <button className="border border-navy-600 rounded px-3 py-1" onClick={() => control("resume")}>resume</button>
          <button className="border border-bad text-bad rounded px-3 py-1" onClick={() => control("stop")}>stop</button>
        </div>
      )}

      {!run && <div className="panel p-6 text-ink-dim">No run yet. Waiting for the team to start…</div>}

      {run && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
          <div className="flex flex-col gap-4 min-w-0">
            <BotGrid bots={bots} live={live} bestBot={bestBot} onOpen={setOpen} />

            <section className="panel p-4">
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="font-semibold">Gap to best known schedule, per round</h2>
                <span className="text-xs text-ink-dim">lower is better · check set is never shown to the bots</span>
              </div>
              <ScoreChart curve={curve} baseline={fcfs?.practice} strongBaseline={state?.baselines?.simple_rule?.practice} solver={state?.solver?.practice} solverSecs={state?.solver?.secs} />
            </section>

            {state?.showcase && (
              <section className="panel p-4">
                <div className="flex items-baseline justify-between mb-2">
                  <h2 className="font-semibold">The team&apos;s best calendar</h2>
                  <span className="text-xs text-ink-dim num">
                    {state.showcase.n_machines} people · {state.showcase.n_jobs} projects · {state.showcase.instance_id}
                  </span>
                </div>
                <Calendar showcase={state.showcase} baselineMakespan={(run as { showcase_fcfs?: number }).showcase_fcfs} />
              </section>
            )}
          </div>

          <aside className="flex flex-col gap-4 min-w-0">
            <section className="panel p-4">
              <h2 className="font-semibold mb-2">Tell the bots something</h2>
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <textarea value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={500} rows={2} placeholder="e.g. try swapping jobs on the busiest person" className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue resize-none" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
                <div className="flex gap-2">
                  <select value={msgBot} onChange={(e) => setMsgBot(e.target.value)} className="bg-navy-800 border border-navy-600 rounded-lg px-2 text-sm flex-1">
                    <option value="">whole team</option>
                    {activeBots.map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <button className="bg-blue text-white rounded-lg px-4 py-1.5 text-sm font-medium">Send</button>
                </div>
                <div className="text-[11px] text-ink-dim">The chief of staff reads these at the start of the next round. You are {name}.</div>
              </form>
              <div className="mt-3 flex flex-col gap-1.5 max-h-56 overflow-auto">
                {[...(state?.messages ?? [])].reverse().map((m) => (
                  <div key={m._id} className="text-sm">
                    <span className={m.name === "Chief of staff" ? "text-blue font-medium" : "font-medium"}>{m.name}</span>
                    {m.bot && <span className="text-ink-dim"> → {m.bot}</span>}
                    <span className="text-ink-dim">: </span>
                    {m.text}
                  </div>
                ))}
              </div>
            </section>

            <section className="panel p-4">
              <h2 className="font-semibold mb-2">Playbook</h2>
              {(state?.playbook ?? []).length === 0 ? (
                <div className="text-sm text-ink-dim">Nothing learned yet.</div>
              ) : (
                <ol className="flex flex-col gap-1">
                  {state!.playbook!.map((l, i) => (
                    <li key={i} className="text-sm">
                      <span className={l.toUpperCase().startsWith("AVOID") ? "text-bad" : "text-good"}>{l.split(":")[0]}:</span>
                      {l.slice(l.indexOf(":") + 1)}
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="panel p-4">
              <h2 className="font-semibold mb-2">Live</h2>
              <div className="flex flex-col gap-1 max-h-64 overflow-auto">
                {activity.length === 0 && <div className="text-sm text-ink-dim">Waiting for activity…</div>}
                {activity.map((a) => (
                  <div key={a.id} className="text-xs">
                    <span className="num text-ink-dim">{new Date(a.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} </span>
                    {a.text}
                  </div>
                ))}
              </div>
            </section>

            {boardUrl && (
              <section className="panel p-4 flex items-center gap-4">
                <div className="bg-white p-2 rounded-lg">
                  <QRCodeSVG value={boardUrl} size={104} />
                </div>
                <div className="text-sm text-ink-dim">Scan to watch and steer the bots from your phone.</div>
              </section>
            )}
          </aside>
        </div>
      )}

      <SchedulePanel />

      {open && <StrategyModal id={open} onClose={() => setOpen(null)} />}
    </main>
  );
}
