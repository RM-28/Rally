"use client";

import { useState } from "react";
import { IDEAS } from "@/lib/board";
import type { Message } from "@/lib/types";
import { who } from "@/lib/words";
import { useBoard } from "./BoardProvider";

const CHIEF = "Chief of staff";
const when = (ts: string) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
const initials = (n: string) =>
  n
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

/** Who sent it, on a 26px avatar: the chief is "CS" on ink, people are initials on a circle. */
export function MessageRow({ m, me }: { m: Message; me?: string }) {
  const chief = m.name === CHIEF;
  return (
    <div className="flex gap-2.5">
      <span
        className="grid h-[26px] w-[26px] flex-none place-items-center text-[10px] font-bold"
        style={{ borderRadius: chief ? 7 : 99, background: chief ? "var(--ink)" : "var(--hover)", color: chief ? "var(--on-ink)" : "var(--ink)" }}
      >
        {chief ? "CS" : initials(m.name)}
      </span>
      <div className="min-w-0 text-[13px]">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="font-semibold">{me && m.name === me ? "You" : who(m.name)}</span>
          {m.bot && <span className="text-ink-3">→ {m.bot}</span>}
          <span className="text-[11px] text-ink-3">{m._id.startsWith("pending-") ? "sending…" : when(m.ts)}</span>
        </div>
        <div className="text-ink" style={{ textWrap: "pretty" }}>
          {m.text}
        </div>
      </div>
    </div>
  );
}

export default function SteerCard() {
  const { state, messages, sendMessage, name } = useBoard();
  const [draft, setDraft] = useState("");
  const [to, setTo] = useState<string | null>(null);
  const active = (state?.bots ?? []).filter((b) => b.status === "active");
  const next = Math.min((state?.round?.n ?? 0) + 1, state?.run?.rounds_planned ?? 1);
  const going = state?.run?.status === "running" || state?.run?.status === "paused";

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    if (!(await sendMessage(text, to))) setDraft(text);
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line-strong bg-surface p-4 shadow-rally">
      <div>
        <h2 className="m-0 text-[16px] font-semibold">Tell the team something</h2>
        <div className="text-[12px] text-ink-3">
          {going ? `The chief of staff reads these when round ${next} starts.` : "No round is running. The chief of staff reads these when the next run starts."} You are {name}.
        </div>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        maxLength={500}
        rows={3}
        placeholder="e.g. try swapping tasks on the busiest person"
        className="w-full resize-none rounded-xl border border-line-strong bg-bg px-3 py-2.5 text-[16px] leading-normal outline-none sm:text-[14px]"
      />
      <div className="flex flex-wrap gap-1.5">
        {IDEAS.map((t) => (
          <button key={t} onClick={() => setDraft(t)} className="h-7 rounded-full border border-line px-2.5 text-[12px] whitespace-nowrap text-ink-2 hover:bg-hover hover:text-ink">
            {t}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] text-ink-3">Who should hear it?</span>
        <div className="flex flex-wrap gap-1.5">
          {[null, ...active.map((b) => b.name)].map((n) => {
            const on = to === n;
            return (
              <button
                key={n ?? "team"}
                aria-pressed={on}
                onClick={() => setTo(n)}
                className="h-7 rounded-full border px-2.5 text-[12px] font-medium whitespace-nowrap"
                style={{ background: on ? "var(--ink)" : "transparent", color: on ? "var(--on-ink)" : "var(--ink-2)", borderColor: on ? "var(--ink)" : "var(--line)" }}
              >
                {n ?? "Whole team"}
              </button>
            );
          })}
        </div>
      </div>
      <button onClick={send} disabled={!draft.trim()} className="h-10 rounded-[10px] bg-ink font-semibold text-on-ink hover:opacity-[.88] disabled:opacity-45">
        Send
      </button>
      <div className="flex max-h-[260px] flex-col gap-2.5 overflow-auto border-t border-line pt-3">
        {messages.length === 0 && <div className="text-[13px] text-ink-3">No messages yet. Be the first.</div>}
        {[...messages].reverse().map((m) => (
          <MessageRow key={m._id} m={m} />
        ))}
      </div>
    </div>
  );
}
