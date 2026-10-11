"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CatchUp, Doc, FileRef, Message } from "@/lib/rally-types";
import { api } from "@/lib/rally/api";
import { AUTONOMY, accent, clock, eventWhen, tint } from "@/lib/rally/format";
import { useRally, whoOf } from "@/lib/rally/store";
import { Avatar, Icon, LiveDot } from "./primitives";

export function MessageRow({ m }: { m: Message }) {
  if (m.kind === "memory") return <MemoryRow m={m} />;
  if (m.kind === "handoff") return <HandoffRow m={m} />;
  return <ChatMessage m={m} />;
}

export function DayDivider({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 text-[12px] text-ink-3">
      <span className="h-px flex-1 bg-line" />
      {text}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function ChatMessage({ m }: { m: Extract<Message, { kind: "msg" }> }) {
  const { state } = useRally();
  const w = whoOf(state, m.author);
  const parts = m.text.split(/(@\w+)/).filter(Boolean);
  return (
    <div className="flex items-start gap-3">
      <Avatar id={m.author} size={32} text={12} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-semibold">{w.name}</span>
          {w.isAgent && w.color && (
            <span className="rounded-[5px] px-1.5 py-px text-[11px] font-semibold" style={tint(w.color)}>
              Agent · {w.role}
            </span>
          )}
          <span className="text-[12px] text-ink-3">{clock(m.ts)}</span>
        </div>
        <div className="-mt-1.5 text-pretty">
          {parts.map((p, i) => {
            const ag = p[0] === "@" && state.agents.find((a) => `@${a.name}`.toLowerCase() === p.toLowerCase());
            return ag ? (
              <span key={i} className="font-semibold" style={{ color: accent(ag.color) }}>
                {p}
              </span>
            ) : (
              <span key={i}>{p}</span>
            );
          })}
        </div>
        {m.bullets && (
          <ul className="m-0 flex list-disc flex-col gap-1 pl-[18px]">
            {m.bullets.map((b) => (
              <li key={b} className="text-pretty">
                {b}
              </li>
            ))}
          </ul>
        )}
        {m.task && <TaskChip title={m.task.title} done={m.task.done} color={w.color ? accent(w.color) : "var(--ink-2)"} />}
        {m.file && <FileCard file={m.file} />}
        {m.eventId && <EventCard id={m.eventId} />}
        {m.approvalId && <ApprovalCard id={m.approvalId} />}
      </div>
    </div>
  );
}

export function TaskChip({ title, done, color }: { title: string; done: boolean; color: string }) {
  return (
    <div className="inline-flex h-8 max-w-full items-center gap-2 self-start overflow-hidden rounded-full border border-line bg-surface px-3 text-[13px] whitespace-nowrap">
      <Icon name={done ? "check_circle" : "progress_activity"} size={18} style={{ color: done ? "var(--ok)" : color }} />
      <span className="truncate">{title}</span>
      <span className="text-ink-3">{done ? "Done" : "Working"}</span>
    </div>
  );
}

/** A Rally calendar event mentioned in a message. Reads the live event, so it updates when approved or removed. */
export function EventCard({ id }: { id: string }) {
  const { state } = useRally();
  const ev = state.calendar.find((e) => e.id === id);
  const gone = !ev || ev.status === "cancelled";
  const tent = ev?.status === "tentative";
  const day = ev ? new Date(ev.start) : null;
  const dateParam = day ? `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}` : "";
  return (
    <div className="flex max-w-[420px] items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5" style={{ opacity: gone ? 0.6 : 1 }}>
      <div className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-sunken text-ink-2">
        <Icon name={gone ? "event_busy" : "calendar_month"} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{ev ? ev.title : "Event removed"}</div>
        <div className="text-[12px] text-ink-3">
          {ev && !gone ? eventWhen(ev.start, ev.end) : "No longer on the calendar"}
          {tent && <span className="ml-1.5 rounded-[5px] bg-warn-bg px-1.5 py-px text-[11px] font-semibold text-warn-fg">Tentative</span>}
        </div>
      </div>
      {!gone && (
        <Link href={`/calendar?date=${dateParam}&event=${id}`} className="inline-flex h-[30px] items-center rounded-lg border border-line-strong bg-surface px-3 font-medium hover:bg-hover">
          View
        </Link>
      )}
    </div>
  );
}

export function FileCard({ file }: { file: FileRef }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex max-w-[420px] items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
      <div className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-sunken text-ink-2">
        <Icon name={file.icon} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{file.name}</div>
        <div className="text-[12px] text-ink-3">{file.meta}</div>
      </div>
      <button
        onClick={() => setOpen(true)}
        disabled={!file.url}
        title={file.url ? "Open" : "This file lives outside Rally"}
        className="h-[30px] rounded-lg border border-line-strong bg-surface px-3 font-medium hover:bg-hover disabled:opacity-50"
      >
        Open
      </button>
      {open && file.url && <DocModal id={file.url} onClose={() => setOpen(false)} />}
    </div>
  );
}

function DocModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    api.doc(id).then(setDoc, (e: Error) => setError(e.message));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id, onClose]);
  const copy = () => {
    if (!doc) return;
    navigator.clipboard.writeText(`${doc.title}\n\n${doc.body}`).then(() => setCopied(true));
  };
  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40" style={{ background: "rgb(41 37 30 / .28)" }} />
      <div role="dialog" aria-modal="true" aria-label={doc?.title ?? "Document"} className="fixed top-[8vh] left-1/2 z-50 flex max-h-[84vh] w-[min(720px,calc(100%-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-rally">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <Icon name="article" />
          <div className="min-w-0 flex-1 truncate text-[16px] font-semibold">{doc?.title ?? "Loading…"}</div>
          <button onClick={copy} disabled={!doc} className="h-8 rounded-lg border border-line-strong px-3 text-[13px] font-medium hover:bg-hover">
            {copied ? "Copied" : "Copy"}
          </button>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-hover">
            <Icon name="close" />
          </button>
        </div>
        <div className="overflow-auto px-6 py-5">
          {error && <div className="text-danger">Couldn’t open this doc: {error}</div>}
          {doc?.body.split(/\n{2,}/).map((p, i) => (
            <p key={i} className="mt-0 mb-3.5 whitespace-pre-wrap text-pretty">
              {p}
            </p>
          ))}
        </div>
      </div>
    </>
  );
}

function MemoryRow({ m }: { m: Extract<Message, { kind: "memory" }> }) {
  const { actions } = useRally();
  return (
    <div className="ml-11 flex items-center gap-2.5 rounded-[10px] border border-dashed border-line-strong px-3 py-2 text-[13px] text-ink-2">
      <Icon name="neurology" size={18} />
      <span className="flex-1">
        {m.undone ? "Forgot:" : "Remembered:"} <span className="text-ink">{m.text}</span>
      </span>
      <button onClick={() => actions.toggleMemory(m.roomId, m.id)} className="font-semibold text-ink">
        {m.undone ? "Redo" : "Undo"}
      </button>
    </div>
  );
}

function HandoffRow({ m }: { m: Extract<Message, { kind: "handoff" }> }) {
  const { state } = useRally();
  const from = whoOf(state, m.from);
  const to = whoOf(state, m.to);
  return (
    <div className="ml-11 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
      <span className="inline-flex items-center gap-1.5">
        <Avatar id={m.from} size={20} radius={6} text={10} weight={700} />
        {from.name}
      </span>
      <Icon name="arrow_forward" size={16} className="text-ink-3" />
      <span className="inline-flex items-center gap-1.5">
        <Avatar id={m.to} size={20} radius={6} text={10} weight={700} />
        {to.name}
      </span>
      <span className="text-ink-3">handed off</span>
      <span className="font-medium text-ink">{m.text}</span>
    </div>
  );
}

export function ApprovalCard({ id }: { id: string }) {
  const { state, actions } = useRally();
  const ap = state.approvals[id];
  if (!ap) return null;
  const agent = state.agents.find((a) => a.id === ap.agentId);
  const by = ap.resolvedBy ? whoOf(state, ap.resolvedBy).name.split(" ")[0] : "";
  const head =
    ap.status === "approved"
      ? { bg: "var(--ok-bg)", fg: "var(--ok)", icon: "check_circle", label: `Approved by ${by}` }
      : ap.status === "declined"
        ? { bg: "var(--hover)", fg: "var(--ink-2)", icon: "block", label: `Declined by ${by}` }
        : { bg: "var(--warn-bg)", fg: "var(--warn-fg)", icon: "front_hand", label: `Needs approval · ${agent?.autonomy === "ask" ? AUTONOMY.ask.label : ap.risk}` };
  return (
    <div className="max-w-[520px] overflow-hidden rounded-[14px] border border-line-strong bg-surface shadow-rally">
      <div className="flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-semibold" style={{ background: head.bg, color: head.fg }}>
        <Icon name={head.icon} size={18} />
        {head.label}
      </div>
      <div className="flex flex-col gap-1.5 px-3.5 py-3">
        <div className="font-semibold">{ap.title}</div>
        {ap.rows.map((r) => (
          <div key={r.k} className="flex gap-3 text-[13px]">
            <span className="w-[52px] flex-none text-ink-3">{r.k}</span>
            <span>{r.v}</span>
          </div>
        ))}
      </div>
      {ap.status === "pending" && (
        <div className="flex flex-wrap gap-2 px-3.5 pb-3.5">
          <button onClick={() => actions.resolveApproval(id, "approved")} className="h-[34px] rounded-[9px] bg-ink px-4 font-semibold text-on-ink hover:opacity-[.88]">
            Approve
          </button>
          <Link href={`/approvals?id=${id}`} className="inline-flex h-[34px] items-center rounded-[9px] border border-line-strong bg-surface px-3.5 font-medium hover:bg-hover">
            Edit
          </Link>
          <button onClick={() => actions.resolveApproval(id, "declined")} className="h-[34px] rounded-[9px] px-3.5 font-medium text-ink-2 hover:bg-hover">
            Decline
          </button>
        </div>
      )}
    </div>
  );
}

export function CatchUpCard({ roomId, c }: { roomId: string; c: CatchUp }) {
  const { state, actions } = useRally();
  const ask = c.approvalId && state.approvals[c.approvalId]?.status === "pending" ? c.ask : "";
  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-line-strong bg-surface px-4 py-3.5 shadow-rally">
      <div className="flex items-center gap-2">
        <Icon name="auto_awesome" size={18} />
        <span className="font-semibold">Catch up</span>
        <span className="text-[12px] text-ink-3">{c.meta}</span>
        <span className="flex-1" />
        <button onClick={() => actions.closeCatchup(roomId)} className="font-medium text-ink-2 hover:text-ink">
          Dismiss
        </button>
      </div>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-[18px]">
        {c.points.map((p) => (
          <li key={p} className="text-pretty">
            {p}
          </li>
        ))}
      </ul>
      {ask && (
        <div className="flex items-center gap-2 pt-1 text-[13px]">
          <span className="h-2 w-2 rounded-full bg-warn" />
          <span className="text-ink-2">Waiting on you:</span>
          <Link href={`/approvals?id=${c.approvalId}`} className="font-semibold underline underline-offset-2">
            {ask}
          </Link>
        </div>
      )}
    </div>
  );
}

export function TypingLine({ text }: { text: string }) {
  return (
    <div className="ml-11 flex items-center gap-2.5 text-[13px] text-ink-2" aria-live="polite">
      <LiveDot />
      <span>{text}</span>
    </div>
  );
}
