"use client";

import type { BotInfo } from "@/lib/types";

export type LiveStatus = "waiting" | "thinking" | "retrying" | "testing" | "scored" | "sat out" | "fired";

export type LiveBot = { status: LiveStatus; change?: string; gap?: number | null; delta?: number | null; error?: string };

const STATUS_STYLE: Record<LiveStatus, string> = {
  waiting: "text-ink-dim border-navy-600",
  thinking: "text-blue border-blue",
  retrying: "text-warn border-warn",
  testing: "text-warn border-warn",
  scored: "text-good border-good",
  "sat out": "text-bad border-bad",
  fired: "text-ink-dim border-navy-600",
};

function Spark({ points }: { points: (number | null)[] }) {
  const vals = points.filter((v): v is number => v != null);
  if (vals.length < 2) return <div className="h-6" />;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const W = 120;
  const H = 24;
  const xs = points.map((_, i) => (i / (points.length - 1)) * W);
  const y = (v: number) => (hi === lo ? H / 2 : 2 + ((v - lo) / (hi - lo)) * (H - 4));
  const d = points
    .map((v, i) => (v == null ? null : `${xs[i].toFixed(1)},${y(v).toFixed(1)}`))
    .filter(Boolean)
    .join(" L");
  return (
    <svg width={W} height={H} className="opacity-90">
      <path d={`M${d}`} fill="none" stroke="#2f8cff" strokeWidth={1.5} />
    </svg>
  );
}

export default function BotGrid({
  bots,
  live,
  bestBot,
  onOpen,
}: {
  bots: BotInfo[];
  live: Record<string, LiveBot>;
  bestBot?: string;
  onOpen: (strategyId: string) => void;
}) {
  // active bots first (hire order), then the most recently fired
  const active = bots.filter((b) => b.status === "active");
  const fired = bots.filter((b) => b.status === "fired").slice(-4).reverse();
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[...active, ...fired].map((b) => {
        const l = live[b.name];
        const status: LiveStatus = b.status === "fired" ? "fired" : (l?.status ?? (b.latest ? (b.latest.status === "ok" ? "scored" : "sat out") : "waiting"));
        const gap = l?.gap ?? b.latest?.gap;
        const delta = l?.delta ?? b.latest?.delta;
        const change = l?.change ?? b.latest?.change ?? b.angle ?? "";
        const isBest = bestBot === b.name;
        return (
          <button
            key={b.name}
            onClick={() => b.latest?.id && onOpen(b.latest.id)}
            className={`panel slide-in text-left p-3 flex flex-col gap-1.5 transition hover:border-blue ${
              status === "fired" ? "opacity-35 grayscale" : ""
            } ${status === "thinking" ? "thinking" : ""} ${isBest ? "ring-1 ring-blue" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-lg">
                {b.name}
                {isBest && <span className="ml-1.5 text-xs text-blue align-middle">best</span>}
              </span>
              <span className={`text-[11px] uppercase tracking-wide border rounded-full px-2 py-0.5 ${STATUS_STYLE[status]}`}>{status}</span>
            </div>
            <div className="text-xs text-ink-dim line-clamp-2 min-h-[2rem]" title={change}>
              {change || "waiting for an assignment"}
            </div>
            <div className="flex items-end justify-between">
              <div>
                <div className="num text-xl">{gap != null ? `${gap.toFixed(2)}%` : "–"}</div>
                {delta != null && (
                  <div className={`num text-xs ${delta < 0 ? "text-good" : delta > 0 ? "text-bad" : "text-ink-dim"}`}>
                    {delta > 0 ? "+" : ""}
                    {delta.toFixed(2)} vs parent
                  </div>
                )}
              </div>
              <Spark points={b.history.map((h) => h.gap)} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
