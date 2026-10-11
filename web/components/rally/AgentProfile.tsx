"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Autonomy } from "@/lib/rally-types";
import { AUTONOMY, accent, dotColor, stamp, tint } from "@/lib/rally/format";
import { pendingApprovals, useRally } from "@/lib/rally/store";
import { DocPreview, SheetPreview } from "./LiveWork";
import { Avatar, btn, Icon, Progress } from "./primitives";

const card = "rounded-2xl border border-line bg-surface p-[18px]";

export default function AgentProfile({ agentId }: { agentId: string }) {
  const { state, actions } = useRally();
  const router = useRouter();
  const a = state.agents.find((x) => x.id === agentId);
  if (!a) {
    return (
      <div className="grid flex-1 place-items-center text-center text-ink-2">
        <div>
          <div className="text-[16px] font-semibold text-ink">Agent not found</div>
          <Link href="/team" className={btn.link}>
            Back to Team
          </Link>
        </div>
      </div>
    );
  }

  const color = accent(a.color);
  const job = [...state.jobs].reverse().find((j) => j.agentId === a.id && j.pct < 100);
  const waiting = pendingApprovals(state).filter((p) => p.agentId === a.id);
  const statusLabel = a.paused ? "Paused" : a.status === "working" ? "Working now" : a.status === "waiting" ? "Waiting" : "Idle";
  const showJob = !!job && !a.paused;
  const idle = a.paused
    ? { text: `${a.name} is paused. Nothing will run until you resume.`, cta: "Resume", go: () => actions.togglePause(a.id) }
    : waiting.length
      ? { text: `${a.name} has ${waiting.length} action${waiting.length > 1 ? "s" : ""} waiting for approval.`, cta: "Review approvals", go: () => router.push(`/approvals?id=${waiting[0].id}`) }
      : { text: `${a.name} isn’t working on anything. Mention @${a.name} in any room to hand over a task.`, cta: "Open a room", go: () => router.push(`/rooms/${state.lastRoom}`) };

  return (
    <section aria-label={`${a.name} profile`} className="min-w-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-[1080px] flex-col gap-6 px-7 pt-7 pb-12">
        <div className="flex flex-wrap gap-1.5">
          {state.agents.map((x) => (
            <Link
              key={x.id}
              href={`/agents/${x.id}`}
              aria-current={x.id === a.id ? "page" : undefined}
              className={`inline-flex h-8 items-center gap-2 rounded-full border pr-3 pl-1.5 font-medium hover:bg-hover ${x.id === a.id ? "border-line-strong bg-surface" : "border-transparent"}`}
            >
              <Avatar id={x.id} size={22} radius={6} text={11} />
              {x.name}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Avatar id={a.id} size={64} radius={18} text={26} />
          <div className="min-w-[240px] flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="m-0 text-[28px] font-semibold tracking-[-0.01em]">{a.name}</h1>
              <span className="rounded-md px-2 py-0.5 text-[12px] font-semibold" style={tint(a.color)}>
                {a.role}
              </span>
            </div>
            <div className="max-w-[60ch] text-pretty text-ink-2">{a.does}</div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                actions.setDraft(`@${a.name} `);
                router.push(`/rooms/${state.lastRoom}`);
              }}
              className={btn.outline}
            >
              Message in room
            </button>
            <button onClick={() => actions.togglePause(a.id)} className={btn.primary}>
              <Icon name={a.paused ? "play_arrow" : "pause"} size={18} />
              {a.paused ? "Resume" : "Pause"}
            </button>
          </div>
        </div>

        <div className="grid items-start gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          <div className="flex min-w-0 flex-col gap-5">
            <div className={`${card} flex flex-col gap-3.5`}>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: dotColor(a) }} />
                <span className="font-semibold">{statusLabel}</span>
                <span className="text-[13px] text-ink-3">{a.paused ? "Paused" : a.now}</span>
              </div>
              {showJob && job && (
                <>
                  <div className="flex flex-col gap-2">
                    {(job.steps ?? []).map((s) => (
                      <div key={s.t} className="flex items-center gap-2.5 text-[13px]" style={{ color: s.state === "todo" ? "var(--ink-3)" : "var(--ink)" }}>
                        <Icon
                          name={s.state === "done" ? "check_circle" : s.state === "active" ? "progress_activity" : "radio_button_unchecked"}
                          size={18}
                          style={{ color: s.state === "done" ? "var(--ok)" : s.state === "active" ? color : "var(--ink-3)" }}
                        />
                        {s.t}
                      </div>
                    ))}
                  </div>
                  {job.preview === "doc" && <DocPreview job={job} big />}
                  {job.preview === "sheet" && <SheetPreview job={job} big />}
                  <Progress pct={job.pct} color={color} />
                </>
              )}
              {!showJob && (
                <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-dashed border-line-strong p-5 text-ink-2">
                  <span className="min-w-[200px] flex-1">{idle.text}</span>
                  <button onClick={idle.go} className="h-[34px] rounded-[9px] border border-line-strong bg-surface px-3.5 font-medium text-ink hover:bg-hover">
                    {idle.cta}
                  </button>
                </div>
              )}
            </div>
            <div className={card}>
              <div className="mb-1.5 font-semibold">Recent work</div>
              {a.recent.length === 0 && <div className="py-2 text-[13px] text-ink-3">Nothing yet.</div>}
              {a.recent.map((r) => (
                <div key={`${r.t}-${r.ts ?? r.d}`} className="flex items-center gap-2.5 border-b border-line last:border-b-0" style={{ minHeight: "var(--row)" }}>
                  <Icon name="check_circle" size={18} className="text-ok" />
                  <span className="flex-1">{r.t}</span>
                  <span className="text-[12px] text-ink-3">{r.ts ? stamp(r.ts) : r.d}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <div className={`${card} flex flex-col gap-2.5`} role="radiogroup" aria-label="Autonomy">
              <div>
                <div className="font-semibold">Autonomy</div>
                <div className="text-[13px] text-ink-2">How much {a.name} can do without asking.</div>
              </div>
              {(Object.keys(AUTONOMY) as Autonomy[]).map((k) => {
                const on = a.autonomy === k;
                return (
                  <button
                    key={k}
                    role="radio"
                    aria-checked={on}
                    onClick={() => actions.setAutonomy(a.id, k)}
                    className={`flex items-start gap-3 rounded-xl border p-3 text-left hover:border-ink-3 ${on ? "border-ink bg-sunken" : "border-line"}`}
                  >
                    <span className="mt-px h-[18px] w-[18px] flex-none rounded-full" style={{ border: on ? "5px solid var(--ink)" : "1.5px solid var(--line-strong)" }} />
                    <span>
                      <span className="block font-semibold">{AUTONOMY[k].label}</span>
                      <span className="block text-[13px] text-pretty text-ink-2">{AUTONOMY[k].desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className={card}>
              <div className="mb-1.5 font-semibold">Tools &amp; access</div>
              {a.tools.map((t) => (
                <div key={t} className="flex items-center gap-2.5 border-b border-line" style={{ minHeight: "var(--row)" }}>
                  <Icon name="link" size={18} className="text-ink-2" />
                  <span className="flex-1">{t}</span>
                  <span className="text-[12px] font-medium text-ok">Connected</span>
                </div>
              ))}
              <Link href="/settings" className={`mt-2.5 inline-block ${btn.link}`}>
                Edit permissions
              </Link>
            </div>
            <div className={card}>
              <div className="font-semibold">Memory</div>
              <div className="mb-1.5 text-[13px] text-ink-2">What {a.name} keeps in mind. Anyone on the team can remove an item.</div>
              {a.memory.length === 0 && <div className="py-2 text-[13px] text-ink-3">Nothing remembered yet.</div>}
              {a.memory.map((m) => (
                <div key={m} className="flex items-start gap-2.5 border-b border-line py-2 last:border-b-0">
                  <Icon name="neurology" size={18} className="text-ink-3" />
                  <span className="flex-1 text-[13px] text-pretty">{m}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
