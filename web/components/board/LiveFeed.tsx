"use client";

import { LiveDot } from "@/components/rally/primitives";
import { useBoard } from "./BoardProvider";

const time = (ts: string) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export default function LiveFeed() {
  const { feed, connected } = useBoard();
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <LiveDot color={connected ? "var(--live)" : "var(--danger)"} />
        <h2 className="m-0 text-[16px] font-semibold">Live</h2>
      </div>
      <div className="flex max-h-[240px] flex-col gap-[5px] overflow-auto">
        {feed.length === 0 && <div className="text-[12px] text-ink-3">Waiting for activity…</div>}
        {feed.map((f) => (
          <div key={f.id} className="flex gap-2 text-[12px]">
            <span className="flex-none font-code text-ink-3">{time(f.ts)}</span>
            <span style={{ textWrap: "pretty" }}>{f.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
