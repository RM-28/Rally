"use client";

import { Fragment, useEffect, useRef } from "react";
import type { Room } from "@/lib/rally-types";
import { accent, dayLabel } from "@/lib/rally/format";
import { useRally } from "@/lib/rally/store";
import LiveWorkPanel from "./LiveWork";
import { CatchUpCard, DayDivider, MessageRow, TypingLine } from "./Messages";
import { Avatar, Icon } from "./primitives";
import { useViewportWidth } from "./Shell";

export default function RoomScreen({ roomId }: { roomId: string }) {
  const { state, actions } = useRally();
  const room = state.rooms.find((r) => r.id === roomId);
  const known = !!room;

  useEffect(() => {
    if (!known) return;
    actions.visitRoom(roomId);
    return () => actions.leaveRoom(roomId);
  }, [known, roomId, actions]);

  if (!room) {
    return (
      <div className="grid flex-1 place-items-center text-center text-ink-2">
        <div>
          <div className="text-[16px] font-semibold text-ink">Room not found</div>
          <div>It may have been renamed or archived.</div>
        </div>
      </div>
    );
  }

  return (
    <section aria-label={`#${room.name}`} className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <RoomHeader room={room} />
        <Thread room={room} />
        <Composer room={room} />
      </div>
      {state.panelOpen && <LiveWorkPanel room={room} />}
    </section>
  );
}

function RoomHeader({ room }: { room: Room }) {
  const { state, actions } = useRally();
  const vw = useViewportWidth();
  const starred = state.starred.includes(room.id);
  const roomFolders = state.folders.filter((f) => f.kind === "room").sort((a, b) => a.order - b.order);
  const folder = roomFolders.find((f) => f.items.includes(room.id));
  const showStack = !state.panelOpen || vw >= (state.treeOpen ? 1400 : 1150);

  return (
    <div className="flex min-h-[60px] flex-none items-center gap-3 border-b border-line px-5 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1">
          <h1 className="m-0 truncate text-[16px] font-semibold">
            <span className="text-ink-3">#</span> {room.name}
          </h1>
          <button
            onClick={() => actions.toggleStar(room.id)}
            title={starred ? "Unstar" : "Star"}
            aria-pressed={starred}
            aria-label={starred ? "Unstar room" : "Star room"}
            className="grid h-[26px] w-[26px] flex-none place-items-center rounded-md hover:bg-hover"
            style={{ color: starred ? "var(--warn)" : "var(--ink-3)" }}
          >
            <Icon name="star" size={18} fill={starred} />
          </button>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-3">
          <Icon name="folder" size={14} />
          <select
            value={folder?.id ?? ""}
            onChange={(e) => actions.moveItem("room", room.id, e.target.value)}
            title="Move to folder"
            aria-label="Move to folder"
            className="flex-none border-0 bg-transparent p-0 text-[12px] text-ink-2 outline-offset-1"
          >
            {!folder && <option value="">No folder</option>}
            {roomFolders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <span>·</span>
          <span className="truncate">{room.topic}</span>
        </div>
      </div>
      {showStack && (
        <div className="flex flex-none pl-1.5">
          {[...room.people, ...room.agents].map((id) => (
            <Avatar key={id} id={id} size={28} text={11} ring="var(--bg)" className="-ml-1.5" />
          ))}
        </div>
      )}
      <button onClick={() => actions.runCatchup(room.id)} className="inline-flex h-[34px] flex-none items-center gap-1.5 rounded-[10px] border border-line-strong bg-surface px-3 font-medium whitespace-nowrap hover:bg-hover">
        <Icon name="auto_awesome" size={18} />
        {state.catchLoading === room.id ? "Summarizing…" : "Catch up"}
      </button>
      <button
        onClick={actions.togglePanel}
        aria-pressed={state.panelOpen}
        className={`inline-flex h-[34px] flex-none items-center gap-1.5 rounded-[10px] border border-line-strong px-3 font-medium whitespace-nowrap hover:bg-hover ${state.panelOpen ? "bg-hover" : "bg-surface"}`}
      >
        <Icon name="right_panel_open" size={18} />
        Live work
      </button>
    </div>
  );
}

function Thread({ room }: { room: Room }) {
  const { state } = useRally();
  const scroller = useRef<HTMLDivElement>(null);
  const msgs = state.messages[room.id] ?? [];
  const catchup = state.catchup[room.id];
  const typing = state.typing[room.id] ?? "";
  const isTyping = !!typing;

  // keep the newest message in view
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [room.id, msgs.length, isTyping]);

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-[760px] flex-col px-6 pt-6 pb-4" style={{ gap: "var(--gap)" }}>
        {msgs.length === 0 && (
          <div className="py-12 text-center text-ink-2">
            <div className="text-[16px] font-semibold text-ink">Nothing here yet</div>
            <div>Write to the room, or type @ to bring in an agent.</div>
          </div>
        )}
        {catchup && <CatchUpCard roomId={room.id} c={catchup} />}
        {msgs.map((m, i) => {
          const label = dayLabel(m.ts);
          const showDay = i === 0 || dayLabel(msgs[i - 1].ts) !== label;
          return (
            <Fragment key={m.id}>
              {showDay && <DayDivider text={label} />}
              <MessageRow m={m} />
            </Fragment>
          );
        })}
        {typing && <TypingLine text={typing} />}
      </div>
    </div>
  );
}

function Composer({ room }: { room: Room }) {
  const { state, actions } = useRally();
  const quick = room.agents
    .flatMap((id) => state.agents.filter((a) => a.id === id))
    .slice(0, 4);
  const has = !!state.draft.trim();
  const mention = (name: string) => {
    const d = state.draft;
    actions.setDraft(`${d && !d.endsWith(" ") ? d + " " : d}@${name} `);
  };

  return (
    <div className="flex-none px-6 pt-2 pb-[18px]">
      <div className="mx-auto max-w-[760px] rounded-2xl border border-line-strong bg-surface py-2.5 pr-2.5 pl-3.5 shadow-rally focus-within:border-ink-3">
        <textarea
          value={state.draft}
          onChange={(e) => actions.setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              actions.send(room.id, state.draft);
            }
          }}
          rows={2}
          aria-label={`Message #${room.name}`}
          placeholder={`Message #${room.name}. Type @ to bring in an agent.`}
          className="composer w-full resize-none border-0 bg-transparent py-0.5 text-[14px] leading-normal outline-0 placeholder:text-ink-3"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <button title="Attach" aria-label="Attach" className="grid h-8 w-8 place-items-center rounded-lg text-ink-2 hover:bg-hover">
            <Icon name="attach_file" />
          </button>
          {quick.map((a) => (
            <button key={a.id} onClick={() => mention(a.name)} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line px-2.5 text-[12px] whitespace-nowrap text-ink-2 hover:bg-hover hover:text-ink">
              <span className="h-2 w-2 rounded-[3px]" style={{ background: accent(a.color) }} />@{a.name}
            </button>
          ))}
          <span className="flex-1" />
          <button
            onClick={() => actions.send(room.id, state.draft)}
            title="Send"
            aria-label="Send"
            disabled={!has}
            className="grid h-[34px] w-[34px] place-items-center rounded-full text-on-ink"
            style={{ background: has ? "var(--ink)" : "var(--line-strong)" }}
          >
            <Icon name="arrow_upward" style={{ fontWeight: 400 }} />
          </button>
        </div>
      </div>
    </div>
  );
}
