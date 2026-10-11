"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { btn, Icon, Segmented } from "@/components/rally/primitives";
import { botSlots, deltaColor, deltaSigned, initial, pct, tint } from "@/lib/board";
import { API_URL } from "@/lib/config";
import { diffLines } from "@/lib/diff";
import type { StrategyDoc } from "@/lib/types";
import { who } from "@/lib/words";
import { useBoard } from "./BoardProvider";

export default function StrategyDrawer({ id }: { id: string }) {
  const { openStrategy, state } = useBoard();
  const [doc, setDoc] = useState<StrategyDoc | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<"code" | "diff">("code");
  const close = () => openStrategy(null);

  useEffect(() => {
    setDoc(null);
    setFailed(false);
    fetch(`${API_URL}/api/strategies/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setDoc)
      .catch(() => setFailed(true));
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && openStrategy(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openStrategy]);

  const diff = useMemo(() => (doc?.code && doc.parent_code ? diffLines(doc.parent_code, doc.code) : null), [doc]);
  const slot = doc ? botSlots(state?.bots ?? [])[doc.bot] : undefined;
  const stats: [string, string, string][] = doc
    ? [
        ["Practice gap", pct(doc.practice_gap), "var(--ink)"],
        ["Check gap", pct(doc.check_gap), "var(--ink)"],
        ["vs parent", deltaSigned(doc.delta), deltaColor(doc.delta)],
        ["Spread", doc.practice_spread != null ? doc.practice_spread.toFixed(2) : "–", "var(--ink)"],
      ]
    : [];

  return (
    <>
      <div onClick={close} className="absolute inset-0 z-40" style={{ background: "rgb(30 27 22 / .28)" }} />
      <div
        role="dialog"
        aria-label="Strategy"
        className="absolute top-3 right-3 bottom-3 z-50 flex flex-col overflow-hidden rounded-[20px] border border-line bg-surface shadow-rally"
        style={{ width: "min(560px, calc(100% - 24px))" }}
      >
        <div className="flex items-center gap-3 border-b border-line px-[18px] py-4">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] font-bold" style={tint(slot)}>
            {doc ? initial(doc.bot) : ""}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-semibold">{doc ? `${who(doc.bot)} · round ${doc.round}` : failed ? "Strategy not found" : "Loading…"}</div>
            <div className="truncate font-code text-[11px] text-ink-3">{id}</div>
          </div>
          <button onClick={close} title="Close" aria-label="Close" className={`${btn.icon} h-8 w-8`}>
            <Icon name="close" />
          </button>
        </div>
        {doc && (
          <div className="flex flex-1 flex-col gap-[18px] overflow-auto p-[18px]">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {stats.map(([k, v, c]) => (
                <div key={k} className="rounded-xl border border-line p-2.5">
                  <div className="text-[11px] text-ink-3">{k}</div>
                  <div className="font-code text-[15px] font-semibold" style={{ color: c }}>
                    {v}
                  </div>
                </div>
              ))}
            </div>
            {doc.change && (
              <div>
                <div className="mb-0.5 text-[12px] text-ink-3">Change assigned by the chief of staff</div>
                <div style={{ textWrap: "pretty" }}>{doc.change}</div>
                {doc.human_message && (
                  <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-warn-bg px-2 py-[3px] text-[12px] font-medium text-warn-fg">
                    <Icon name="chat" size={16} />
                    From {doc.human_message.name}’s message
                  </div>
                )}
              </div>
            )}
            {doc.note && (
              <div>
                <div className="mb-0.5 text-[12px] text-ink-3">Bot’s note</div>
                <div className="text-ink-2" style={{ textWrap: "pretty" }}>
                  {doc.note}
                </div>
              </div>
            )}
            {doc.error && (
              <div className="rounded-[10px] bg-bad-bg px-3 py-2 font-code text-[12px] text-danger" style={{ overflowWrap: "anywhere" }}>
                {doc.error}
              </div>
            )}
            {doc.parent_id && (
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="text-ink-3">Parent</span>
                <Link href={`/lineage?sid=${encodeURIComponent(doc._id)}`} onClick={close} className="font-code text-[12px] underline underline-offset-2 hover:opacity-75">
                  {doc.parent_id}
                </Link>
              </div>
            )}
            {doc.per_instance && Object.keys(doc.per_instance).length > 0 && (
              <div>
                <div className="mb-1.5 text-[12px] text-ink-3">Gap per practice instance</div>
                <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))" }}>
                  {Object.entries(doc.per_instance).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-1.5 rounded-[7px] bg-sunken px-2 py-[5px] font-code text-[11px]">
                      <span className="text-ink-3">{k}</span>
                      <span>{v != null ? v.toFixed(2) : "–"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {doc.code && (
              <div>
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className="flex-1 text-[12px] text-ink-3">Strategy code · runs under python -I with an import allowlist</span>
                  {diff && (
                    <Segmented
                      small
                      options={[
                        ["code", "Full code"],
                        ["diff", "What changed"],
                      ]}
                      value={view}
                      onChange={setView}
                    />
                  )}
                </div>
                <pre className="m-0 overflow-auto rounded-xl border border-line bg-sunken p-3.5 font-code text-[12px] leading-[1.55] whitespace-pre">
                  {view === "diff" && diff
                    ? diff
                        .filter((l, i, arr) => l.kind !== "same" || arr.slice(Math.max(0, i - 3), i + 4).some((x) => x.kind !== "same"))
                        .map((l, i) => (
                          <div key={i} style={{ color: l.kind === "add" ? "var(--ok)" : l.kind === "del" ? "var(--danger)" : "var(--ink-3)", background: l.kind === "add" ? "var(--ok-bg)" : l.kind === "del" ? "var(--bad-bg)" : undefined }}>
                            {l.kind === "add" ? "+ " : l.kind === "del" ? "- " : "  "}
                            {l.text}
                          </div>
                        ))
                    : doc.code}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
