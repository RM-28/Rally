"use client";

import { useEffect, useMemo, useState } from "react";
import { API_URL } from "@/lib/config";
import { diffLines } from "@/lib/diff";
import type { StrategyDoc } from "@/lib/types";

export default function StrategyModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [doc, setDoc] = useState<StrategyDoc | null>(null);
  const [view, setView] = useState<"diff" | "code">("diff");

  useEffect(() => {
    fetch(`${API_URL}/api/strategies/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then(setDoc)
      .catch(() => setDoc(null));
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const diff = useMemo(() => (doc?.code && doc.parent_code ? diffLines(doc.parent_code, doc.code) : null), [doc]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="panel w-full max-w-4xl max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-navy-700 flex items-start justify-between gap-4">
          {doc ? (
            <div>
              <div className="font-semibold text-lg">
                {doc.bot} <span className="text-ink-dim text-sm">round {doc.round}</span>
              </div>
              {doc.change && <div className="text-sm text-ink-dim mt-1">Assignment: {doc.change}</div>}
              {doc.note && <div className="text-sm mt-1">Note: {doc.note}</div>}
              <div className="num text-sm mt-1">
                practice {doc.practice_gap != null ? `${doc.practice_gap.toFixed(2)}%` : "–"}
                {doc.delta != null && ` (${doc.delta > 0 ? "+" : ""}${doc.delta.toFixed(2)} vs parent)`}
                {doc.check_gap != null && ` · check ${doc.check_gap.toFixed(2)}%`}
              </div>
              {doc.error && <div className="text-sm text-bad mt-1 num">{doc.error}</div>}
            </div>
          ) : (
            <div className="text-ink-dim">loading…</div>
          )}
          <div className="flex gap-2 shrink-0">
            {(["diff", "code"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-1 rounded-md text-sm border ${view === v ? "border-blue text-blue" : "border-navy-600 text-ink-dim"}`}>
                {v === "diff" ? "what changed" : "full code"}
              </button>
            ))}
            <button onClick={onClose} className="px-3 py-1 rounded-md text-sm border border-navy-600">
              close
            </button>
          </div>
        </div>
        <pre className="num text-[12px] leading-[1.45] overflow-auto p-4 flex-1">
          {!doc?.code ? (
            <span className="text-ink-dim">no code</span>
          ) : view === "diff" && diff ? (
            diff
              .filter((l, i, arr) => l.kind !== "same" || arr.slice(Math.max(0, i - 3), i + 4).some((x) => x.kind !== "same"))
              .map((l, i) => (
                <div key={i} className={l.kind === "add" ? "bg-good/10 text-good" : l.kind === "del" ? "bg-bad/10 text-bad" : "text-ink-dim"}>
                  {l.kind === "add" ? "+ " : l.kind === "del" ? "- " : "  "}
                  {l.text}
                </div>
              ))
          ) : (
            doc.code
          )}
        </pre>
      </div>
    </div>
  );
}
