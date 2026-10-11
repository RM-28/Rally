"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tint } from "@/lib/rally/format";
import { useRally } from "@/lib/rally/store";
import { Icon } from "./primitives";

type Item = { key: string; label: string; hint: string; glyph?: { init: string; style: React.CSSProperties }; icon?: string; run: () => void };

export default function CommandPalette() {
  const { state, actions } = useRally();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const query = q.trim().toLowerCase();
  const match = (s: string) => !query || s.toLowerCase().includes(query);
  const limit = query ? 8 : 4;
  const close = () => actions.patch({ palette: false });

  const rooms: Item[] = state.rooms
    .filter((r) => match(`${r.name} ${r.topic}`))
    .slice(0, limit)
    .map((r) => ({
      key: `r-${r.id}`, label: r.name, hint: state.folders.find((f) => f.kind === "room" && f.items.includes(r.id))?.name ?? "",
      glyph: { init: "#", style: { background: "var(--hover)", color: "var(--ink-2)" } }, run: () => router.push(`/rooms/${r.id}`),
    }));
  const agents: Item[] = state.agents
    .filter((a) => match(`${a.name} ${a.role}`))
    .slice(0, limit)
    .map((a) => ({ key: `a-${a.id}`, label: a.name, hint: a.role, glyph: { init: a.name[0], style: tint(a.color) }, run: () => router.push(`/agents/${a.id}`) }));
  const acts: Item[] = (
    [
      ["New agent", "add", () => actions.patch({ createOpen: true })],
      ["Review approvals", "inbox", () => router.push("/approvals")],
      ["Open the calendar", "calendar_month", () => router.push("/calendar")],
      ["Open the board", "view_kanban", () => router.push("/board")],
      ["Routines", "event_repeat", () => router.push("/routines")],
      ["Activity log", "history", () => router.push("/activity")],
      ["Agent permissions", "tune", () => router.push("/settings")],
      ["Switch light / dark", "contrast", actions.toggleTheme],
    ] as [string, string, () => void][]
  )
    .filter(([l]) => match(l))
    .map(([label, icon, run]) => ({ key: `x-${label}`, label, hint: "", icon, run }));

  const flat = [...rooms, ...agents, ...acts];
  const cur = Math.min(idx, Math.max(0, flat.length - 1));
  const go = (it: Item) => {
    close();
    it.run();
  };
  let n = 0;

  return (
    <>
      <div onClick={close} className="absolute inset-0 z-40" style={{ background: "rgb(41 37 30 / .28)" }} />
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="absolute top-[12vh] left-1/2 z-50 flex max-h-[70vh] w-[min(580px,calc(100%-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-rally">
        <div className="flex items-center gap-2.5 border-b border-line px-4 text-ink-3">
          <Icon name="search" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIdx(Math.min(cur + 1, flat.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIdx(Math.max(0, cur - 1));
              } else if (e.key === "Enter" && flat[cur]) {
                e.preventDefault();
                go(flat[cur]);
              }
            }}
            placeholder="Jump to a room, agent or action"
            aria-label="Search"
            className="h-[54px] flex-1 border-0 bg-transparent text-[15px] text-ink outline-0"
          />
          <kbd className="rounded-[5px] border border-line px-1.5 py-px font-code text-[11px]">esc</kbd>
        </div>
        <div className="min-h-0 overflow-auto p-1.5" role="listbox">
          {(
            [
              ["Rooms", rooms],
              ["Agents", agents],
              ["Actions", acts],
            ] as [string, Item[]][]
          )
            .filter(([, items]) => items.length)
            .map(([label, items]) => (
              <div key={label}>
                <div className="px-2.5 pt-2 pb-1 text-[12px] font-medium text-ink-3">{label}</div>
                {items.map((it) => {
                  const i = n++;
                  return (
                    <button
                      key={it.key}
                      role="option"
                      aria-selected={i === cur}
                      onClick={() => go(it)}
                      onMouseEnter={() => i !== cur && setIdx(i)}
                      className={`flex h-[38px] w-full items-center gap-2.5 rounded-[9px] px-2.5 text-left ${i === cur ? "bg-hover" : ""}`}
                    >
                      {it.icon ? (
                        <span className="grid w-[22px] flex-none place-items-center text-ink-2">
                          <Icon name={it.icon} size={18} />
                        </span>
                      ) : (
                        <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-md text-[11px] font-bold" style={it.glyph?.style}>
                          {it.glyph?.init}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate">{it.label}</span>
                      <span className="text-[12px] whitespace-nowrap text-ink-3">{it.hint}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          {flat.length === 0 && <div className="p-7 text-center text-ink-3">No matches for “{q}”</div>}
        </div>
        <div className="flex gap-4 border-t border-line px-4 py-2 text-[12px] text-ink-3">
          <span className="whitespace-nowrap">↑ ↓ to move</span>
          <span className="whitespace-nowrap">↵ to open</span>
          <span className="whitespace-nowrap">⌘K anywhere</span>
        </div>
      </div>
    </>
  );
}
