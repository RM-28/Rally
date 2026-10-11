"use client";

import { botSlots, deltaColor, deltaWords, STATUS_LABEL, STATUS_TONE, statusOf, tint } from "@/lib/board";
import type { BotInfo } from "@/lib/types";
import { useBoard } from "./BoardProvider";

/** Last 8 rounds as a 96×28 line; values over 100% (wild first tries) are left out. */
function Spark({ points, color }: { points: (number | null)[]; color: string }) {
  const pts = points.slice(-8).map((v) => (v == null || v > 100 ? null : v));
  const vals = pts.filter((v): v is number => v != null);
  if (vals.length < 2) return <span className="h-7 w-24 flex-none" />;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const d = pts
    .map((v, i) => (v == null ? null : `${((i / Math.max(1, pts.length - 1)) * 96).toFixed(1)},${(hi === lo ? 14 : 3 + ((v - lo) / (hi - lo)) * 22).toFixed(1)}`))
    .filter(Boolean)
    .map((p, i) => (i ? "L" : "M") + p)
    .join(" ");
  return (
    <svg viewBox="0 0 96 28" className="h-7 w-24 flex-none overflow-visible" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function BotTiles({ bots }: { bots: BotInfo[] }) {
  const { live, state, openStrategy } = useBoard();
  const slots = botSlots(bots);
  const bestId = state?.round?.best_ever_id;
  const bestBot = state?.round?.leaderboard?.find((l) => l.id === bestId)?.bot;
  const active = bots.filter((b) => b.status === "active");
  const fired = bots.filter((b) => b.status === "fired").slice(-4).reverse();

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
      {[...active, ...fired].map((b) => {
        const l = live[b.name];
        const st = statusOf(b, l);
        const [sBg, sFg] = STATUS_TONE[st];
        const gap = l?.gap ?? b.latest?.gap;
        const delta = l?.status === "scored" ? l.delta : l ? null : b.latest?.delta;
        // the ring marks who holds the record; the tag only sits next to the record itself
        const isBest = b.name === bestBot && b.status === "active";
        const isRecord = isBest && !l && b.latest?.id === bestId;
        const tone = tint(slots[b.name]);
        const change =
          b.status === "fired"
            ? `Left in round ${b.fired_round}`
            : (l?.change ?? (b.latest ? b.latest.change : null) ?? (b.angle ? `New hire. Angle: ${b.angle}` : "Waiting for a task from the chief of staff"));
        return (
          <button
            key={b.name}
            onClick={() => b.latest?.id && openStrategy(b.latest.id)}
            disabled={!b.latest?.id}
            className="flex min-w-0 flex-col gap-2 rounded-[14px] border border-line bg-surface p-3 text-left hover:border-line-strong disabled:cursor-default"
            style={{ opacity: b.status === "fired" ? 0.45 : 1, boxShadow: isBest ? "0 0 0 1.5px var(--ink)" : undefined }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid h-7 w-7 flex-none place-items-center rounded-lg text-[13px] font-semibold" style={tone}>
                {b.name[0]}
              </span>
              <span className="flex-none text-[15px] font-semibold whitespace-nowrap">{b.name}</span>
              <span className="flex-1" />
              <span className="inline-flex h-[22px] flex-none items-center gap-[5px] rounded-full px-2 text-[11px] font-semibold whitespace-nowrap" style={{ background: sBg, color: sFg }}>
                {(st === "thinking" || st === "testing") && <span className="r-pulse-fast inline-block h-[7px] w-[7px] rounded-full" style={{ background: sFg }} />}
                {STATUS_LABEL[st]}
              </span>
            </div>
            <div title={change ?? ""} className="line-clamp-2 min-h-[35px] text-[12px] text-ink-2" style={{ textWrap: "pretty" }}>
              {change}
            </div>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-code text-[20px] leading-[1.1] font-semibold">{gap != null ? `${gap.toFixed(2)}%` : "–"}</span>
                  {isRecord && <span className="rounded-[5px] bg-ink px-1.5 py-px text-[10px] font-bold whitespace-nowrap text-on-ink">RECORD</span>}
                </div>
                <div className="text-[11px] whitespace-nowrap text-ink-3">behind best known</div>
                <div className="min-h-[16px] text-[11px] font-semibold whitespace-nowrap" style={{ color: deltaColor(delta) }}>
                  {deltaWords(delta)}
                </div>
              </div>
              <Spark points={b.history.map((h) => h.gap)} color={tone.color} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
