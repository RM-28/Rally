"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Approval } from "@/lib/rally-types";
import { ago, tint } from "@/lib/rally/format";
import { pendingApprovals, useRally, whoOf } from "@/lib/rally/store";
import { Avatar, Icon } from "./primitives";

const tagFor = (ap: Approval) =>
  ap.status === "pending"
    ? { label: ap.risk, bg: "var(--warn-bg)", fg: "var(--warn-fg)" }
    : ap.status === "approved"
      ? { label: "Approved", bg: "var(--ok-bg)", fg: "var(--ok)" }
      : { label: "Declined", bg: "var(--hover)", fg: "var(--ink-2)" };

export default function ApprovalsScreen() {
  const { state } = useRally();
  const router = useRouter();
  const params = useSearchParams();
  const pending = pendingApprovals(state);
  const list = Object.values(state.approvals).sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1));
  const selId = params.get("id") && state.approvals[params.get("id")!] ? params.get("id")! : (pending[0]?.id ?? list[0]?.id);

  return (
    <section aria-label="Approvals" className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 w-[380px] flex-none flex-col border-r border-line">
        <div className="px-5 pt-6 pb-3">
          <h1 className="m-0 text-[24px] font-semibold">Approvals</h1>
          <div className="text-ink-2">{pending.length ? `${pending.length} waiting on you` : "You’re all caught up"}</div>
        </div>
        <div className="flex flex-1 flex-col gap-0.5 overflow-auto px-2.5 pb-4">
          {list.map((ap) => {
            const w = whoOf(state, ap.agentId);
            const tag = tagFor(ap);
            const sel = ap.id === selId;
            const room = state.rooms.find((r) => r.id === ap.roomId);
            return (
              <button
                key={ap.id}
                onClick={() => router.replace(`/approvals?id=${ap.id}`, { scroll: false })}
                aria-current={sel ? "true" : undefined}
                className={`flex items-start gap-3 rounded-xl px-2.5 py-3 text-left hover:bg-hover ${sel ? "bg-hover" : ""}`}
                style={{ opacity: ap.status === "pending" || sel ? 1 : 0.7 }}
              >
                <Avatar id={ap.agentId} size={30} text={12} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{ap.title}</div>
                  <div className="text-[12px] text-ink-3">
                    {w.name} · #{room?.name} · {ago(ap.createdAt)}
                  </div>
                </div>
                <span className="rounded-[5px] px-[7px] py-0.5 text-[11px] font-semibold whitespace-nowrap" style={{ background: tag.bg, color: tag.fg }}>
                  {tag.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-auto">{selId && <ApprovalDetail id={selId} />}</div>
    </section>
  );
}

function ApprovalDetail({ id }: { id: string }) {
  const { state, actions } = useRally();
  const ap = state.approvals[id];
  const w = whoOf(state, ap.agentId);
  const by = ap.resolvedBy ? whoOf(state, ap.resolvedBy) : null;
  const byMe = ap.resolvedBy === state.me;
  const resText =
    ap.status === "approved"
      ? byMe
        ? `Approved by you. ${w.name} has gone ahead.`
        : `Approved by ${by?.name} ${ap.resolvedAt ? ago(ap.resolvedAt).toLowerCase() : ""}`.trim()
      : `Declined. ${w.name} won’t do this.`;

  return (
    <div className="flex max-w-[720px] flex-col gap-5 px-8 pt-7 pb-12">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-xl text-[17px] font-semibold" style={w.color ? tint(w.color) : undefined}>
          {w.init}
        </span>
        <div className="flex-1">
          <div className="text-[13px] text-ink-2">{w.name} wants to</div>
          <div className="text-[22px] font-semibold tracking-[-0.01em]">{ap.title}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-[10px] bg-sunken px-3 py-2.5 text-[13px] text-ink-2">
        <Icon name="shield_person" size={18} />
        {ap.rule}
      </div>
      <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
        {ap.rows.map((r) => (
          <div key={r.k} className="flex gap-4 border-b border-line px-4 py-2.5 last:border-b-0">
            <span className="w-[72px] flex-none text-ink-3">{r.k}</span>
            <span className="font-medium">{r.v}</span>
          </div>
        ))}
        {ap.body && <div className="border-t border-line p-4 text-pretty">{ap.body}</div>}
      </div>
      <div>
        <div className="mb-1 font-semibold">Why {w.name} is asking</div>
        <div className="text-pretty text-ink-2">{ap.why}</div>
      </div>
      {ap.status === "pending" ? (
        <>
          {ap.alwaysAllowLabel && (
            <label className="flex cursor-pointer items-center gap-2.5">
              <input type="checkbox" checked={!!state.alwaysAllow[id]} onChange={() => actions.toggleAlways(id)} className="h-4 w-4 accent-[var(--ink)]" />
              <span>{ap.alwaysAllowLabel}</span>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => actions.resolveApproval(id, "approved")} className="h-10 rounded-[10px] bg-ink px-[18px] font-semibold text-on-ink hover:opacity-[.88]">
              Approve
            </button>
            <button className="h-10 rounded-[10px] border border-line-strong bg-surface px-4 font-medium hover:bg-hover">Edit first</button>
            <button onClick={() => actions.resolveApproval(id, "declined")} className="h-10 rounded-[10px] px-4 font-medium text-danger hover:bg-hover">
              Decline
            </button>
          </div>
        </>
      ) : (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-xl px-3.5 py-3 font-medium"
          style={ap.status === "approved" ? { background: "var(--ok-bg)", color: "var(--ok)" } : { background: "var(--hover)", color: "var(--ink-2)" }}
        >
          <Icon name={ap.status === "approved" ? "check_circle" : "block"} />
          {resText}
          <span className="flex-1" />
          <button onClick={() => actions.resolveApproval(id, "pending")} className="font-semibold text-inherit">
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
