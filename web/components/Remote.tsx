"use client";

import { useState } from "react";
import { useBoard } from "@/components/board/BoardProvider";
import { MessageRow } from "@/components/board/SteerCard";
import { IDEAS, STATUS_LABEL, STATUS_TONE, statusOf } from "@/lib/board";
import { APP_NAME } from "@/lib/config";

const card = "rounded-2xl border border-line bg-surface p-4";

/** The phone view: a remote control for steering the bots, with a link to the full board. */
export default function Remote() {
  const { state, live, name, connected, sendMessage, setView, messages, error } = useBoard();
  const [text, setText] = useState("");
  const [bot, setBot] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const run = state?.run;
  const round = state?.round?.n;
  const nowGap = state?.round?.best_ever_practice_gap;
  const active = (state?.bots ?? []).filter((b) => b.status === "active");
  const running = run?.status === "running" && !run.paused;

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    const ok = await sendMessage(t, bot);
    setSending(false);
    if (ok) {
      setText("");
      setSent(`Sent to ${bot ?? "the whole team"}. The chief of staff reads it when round ${(round ?? 0) + 1} starts.`);
    } else setSent(null);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 px-4 pt-3 pb-24">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span title={connected ? "Live" : "Reconnecting…"} className="h-[9px] w-[9px] rounded-full" style={{ background: connected ? "var(--live)" : "var(--danger)" }} />
          <span className="text-[17px] font-semibold">{state?.app_name ?? APP_NAME}</span>
        </div>
        <div className="text-right font-code text-[13px]">
          {run ? (
            <>
              <span className="text-ink-3">Round </span>
              {round ?? "–"}
              <span className="text-ink-3"> of {run.rounds_planned}</span>
            </>
          ) : (
            <span className="text-ink-3">not running</span>
          )}
        </div>
      </header>
      {error && <div className="text-[13px] font-medium text-danger">{error}</div>}

      {nowGap != null && (
        <div className={card}>
          <div className="text-[12px] text-ink-3">Team’s best plan so far</div>
          <div className="font-code text-[24px] font-semibold">
            {nowGap.toFixed(2)}% <span className="font-rally text-[13px] font-normal text-ink-2">behind the best known plan</span>
          </div>
        </div>
      )}

      <section className={`${card} flex flex-col gap-3 border-line-strong shadow-rally`}>
        <h1 className="m-0 text-[20px] font-semibold">Tell the team something</h1>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="e.g. focus on the busiest person"
          className="w-full resize-none rounded-xl border border-line-strong bg-bg px-3 py-2.5 text-[16px] outline-none"
        />
        <div className="flex flex-wrap gap-1.5">
          {IDEAS.map((idea) => (
            <button key={idea} onClick={() => setText(idea)} className="h-8 rounded-full border border-line px-3 text-[12px] text-ink-2">
              {idea}
            </button>
          ))}
        </div>
        <div>
          <div className="mb-1.5 text-[12px] text-ink-3">Who should hear it?</div>
          <div className="flex flex-wrap gap-1.5">
            {[null, ...active.map((b) => b.name)].map((n) => {
              const on = bot === n;
              return (
                <button
                  key={n ?? "team"}
                  onClick={() => setBot(n)}
                  aria-pressed={on}
                  className="h-8 rounded-full border px-3 text-[13px] font-medium"
                  style={{ background: on ? "var(--ink)" : "transparent", color: on ? "var(--on-ink)" : "var(--ink-2)", borderColor: on ? "var(--ink)" : "var(--line)" }}
                >
                  {n ?? "Whole team"}
                </button>
              );
            })}
          </div>
        </div>
        <button onClick={send} disabled={!text.trim() || sending} className="h-12 rounded-[10px] bg-ink text-[16px] font-semibold text-on-ink disabled:opacity-45">
          {sending ? "Sending…" : "Send"}
        </button>
        {sent && <div className="text-[13px] font-medium text-ok">{sent}</div>}
        {!running && run && <div className="text-[12px] text-warn-fg">The bots are {run.paused ? "paused" : "not running"} right now, so replies may take a while.</div>}
        <div className="text-[12px] text-ink-3">You are {name}.</div>
      </section>

      <section className={card}>
        <h2 className="m-0 mb-3 text-[16px] font-semibold">Conversation</h2>
        {messages.length === 0 ? (
          <div className="text-[13px] text-ink-3">No messages yet. Be the first.</div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {[...messages]
              .reverse()
              .slice(0, 30)
              .map((m) => (
                <MessageRow key={m._id} m={m} me={name} />
              ))}
          </div>
        )}
      </section>

      {active.length > 0 && (
        <section className={card}>
          <h2 className="m-0 mb-1 text-[16px] font-semibold">The team right now</h2>
          <div className="flex flex-col divide-y divide-line">
            {active.map((b) => {
              const s = statusOf(b, live[b.name]);
              const [bg, fg] = STATUS_TONE[s];
              const gap = live[b.name]?.gap ?? b.latest?.gap;
              return (
                <div key={b.name} className="flex items-center justify-between gap-2 py-2">
                  <span className="font-medium">{b.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-code text-[13px] text-ink-2">{gap != null ? `${gap.toFixed(2)}%` : ""}</span>
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap" style={{ background: bg, color: fg }}>
                      {STATUS_LABEL[s]}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <button onClick={() => setView("board")} className="h-12 rounded-[10px] border border-line-strong bg-surface text-[14px] font-medium">
        See the full board: chart and calendar →
      </button>
    </main>
  );
}
