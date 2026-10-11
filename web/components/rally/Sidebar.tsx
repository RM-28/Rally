"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";
import type { Agent, Folder, Room } from "@/lib/rally-types";
import { dotColor, tint } from "@/lib/rally/format";
import { pendingApprovals, useRally } from "@/lib/rally/store";
import { btn, Icon, Pills } from "./primitives";

type Drag = { kind: Folder["kind"]; id: string } | null;

export default function Sidebar() {
  const { state, actions } = useRally();
  const path = usePathname();
  const dragging = useRef<Drag>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const onlyActive = state.treeFilter === "unread";
  const pending = pendingApprovals(state);

  const activeRoom = path.startsWith("/rooms/") ? decodeURIComponent(path.split("/")[2] ?? "") : "";
  const activeAgent = path.startsWith("/agents/") ? decodeURIComponent(path.split("/")[2] ?? "") : "";
  const roomById = (id: string) => state.rooms.find((r) => r.id === id);
  const agentById = (id: string) => state.agents.find((a) => a.id === id);
  const isActiveAgent = (a: Agent) => a.status === "working" || pending.some((p) => p.agentId === a.id);
  const dragProps = (kind: Folder["kind"], id: string) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      dragging.current = { kind, id };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
    },
    onDragEnd: () => {
      dragging.current = null;
      setDropOn(null);
    },
  });

  const roomItem = (r: Room, indent: number) => (
    <RoomItem key={r.id} room={r} indent={indent} on={r.id === activeRoom} {...dragProps("room", r.id)} />
  );
  const agentItem = (a: Agent, indent: number) => {
    const waiting = pending.filter((p) => p.agentId === a.id).length;
    const meta = a.paused ? "Paused" : waiting ? `${waiting} waiting` : a.status === "working" ? "Working" : "";
    return <AgentItem key={a.id} agent={a} indent={indent} meta={meta} on={a.id === activeAgent} {...dragProps("agent", a.id)} />;
  };

  const tree = (kind: Folder["kind"]) =>
    state.folders
      .filter((f) => f.kind === kind)
      .sort((a, b) => a.order - b.order)
      .map((f) => {
        const all = f.items.map((id) => (kind === "room" ? roomById(id) : agentById(id))).filter(Boolean) as (Room | Agent)[];
        const shown = onlyActive ? all.filter((x) => (kind === "room" ? (x as Room).unread > 0 : isActiveAgent(x as Agent))) : all;
        if (onlyActive && shown.length === 0) return null;
        const unread = kind === "room" ? (all as Room[]).reduce((n, r) => n + r.unread, 0) : 0;
        return (
          <FolderGroup
            key={f.id}
            folder={f}
            open={onlyActive || f.open}
            count={all.length}
            unread={unread}
            drop={dropOn === f.id}
            onDragOver={(e) => {
              if (dragging.current?.kind !== kind) return;
              e.preventDefault();
              if (dropOn !== f.id) setDropOn(f.id);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropOn((d) => (d === f.id ? null : d));
            }}
            onDrop={(e) => {
              e.preventDefault();
              const d = dragging.current;
              dragging.current = null;
              setDropOn(null);
              if (d && d.kind === kind) actions.moveItem(kind, d.id, f.id);
            }}
          >
            {shown.map((x) => (kind === "room" ? roomItem(x as Room, 30) : agentItem(x as Agent, 30)))}
          </FolderGroup>
        );
      });

  const starred = state.starred
    .map((id) => {
      const r = roomById(id);
      if (r) return roomItem(r, 8);
      const a = agentById(id);
      return a ? agentItem(a, 8) : null;
    })
    .filter(Boolean);

  return (
    <aside aria-label="Sidebar" className="flex min-h-0 w-64 flex-none flex-col border-r border-line bg-sunken">
      <div className="flex items-center gap-1.5 pt-3.5 pr-2.5 pb-2.5 pl-4">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{state.workspace.name}</div>
          <div className="text-[12px] text-ink-3">
            {state.people.length} {state.people.length === 1 ? "person" : "people"} · {state.agents.length} agents · {state.rooms.length} rooms
          </div>
        </div>
        <button onClick={actions.toggleTree} title="Hide sidebar" aria-label="Hide sidebar" className={`${btn.icon} h-8 w-8`}>
          <Icon name="left_panel_close" />
        </button>
      </div>
      <div className="px-2.5 pb-2">
        <button onClick={actions.openPalette} className="flex h-[34px] w-full items-center gap-2 rounded-[9px] border border-line bg-surface pr-2 pl-2.5 text-left text-ink-3 hover:border-line-strong">
          <Icon name="search" size={18} />
          <span className="flex-1">Jump to…</span>
          <kbd className="rounded-[5px] border border-line px-[5px] py-px font-code text-[11px]">⌘K</kbd>
        </button>
      </div>
      <div className="flex gap-1 px-2.5 pb-1">
        <Pills options={[["all", "All"], ["unread", "Unread & active"]]} value={state.treeFilter} onChange={(v) => actions.patch({ treeFilter: v })} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1.5 pb-5">
        {starred.length > 0 && (
          <>
            <div className="px-2 pt-3.5 pb-1 text-[12px] font-medium text-ink-3">Starred</div>
            {starred}
          </>
        )}
        <SectionHead label="Rooms">
          <button onClick={() => actions.addFolder("room")} title="New folder" aria-label="New room folder" className={`${btn.icon} h-[26px] w-[26px] rounded-md`}>
            <Icon name="create_new_folder" size={17} />
          </button>
        </SectionHead>
        {tree("room")}
        <SectionHead label="Agents">
          <button onClick={() => actions.addFolder("agent")} title="New folder" aria-label="New agent folder" className={`${btn.icon} h-[26px] w-[26px] rounded-md`}>
            <Icon name="create_new_folder" size={17} />
          </button>
          <button onClick={() => actions.patch({ createOpen: true })} title="New agent" aria-label="New agent" className={`${btn.icon} h-[26px] w-[26px] rounded-md`}>
            <Icon name="add" size={18} />
          </button>
        </SectionHead>
        {tree("agent")}
      </div>
    </aside>
  );
}

function SectionHead({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-0.5 pt-3.5 pr-1 pb-1 pl-2">
      <span className="flex-1 text-[12px] font-medium text-ink-3">{label}</span>
      {children}
    </div>
  );
}

type FolderGroupProps = {
  folder: Folder; open: boolean; count: number; unread: number; drop: boolean; children: React.ReactNode;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void; onDragLeave: (e: DragEvent<HTMLDivElement>) => void; onDrop: (e: DragEvent<HTMLDivElement>) => void;
};

function FolderGroup({ folder: f, open, count, unread, drop, children, onDragOver, onDragLeave, onDrop }: FolderGroupProps) {
  const { state, actions } = useRally();
  const editing = state.editFolder === f.id;
  const [draft, setDraft] = useState(f.name);
  const startEdit = () => {
    setDraft(f.name);
    actions.startRename(f.id);
  };
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="rounded-lg"
      style={{ background: drop ? "var(--a1-bg)" : "transparent", boxShadow: `inset 0 0 0 1px ${drop ? "var(--a1)" : "transparent"}` }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        title="Double-click to rename"
        onClick={() => !editing && actions.toggleFolder(f.id)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startEdit();
        }}
        onKeyDown={(e) => {
          if (editing) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            actions.toggleFolder(f.id);
          } else if (e.key === "F2") startEdit();
        }}
        className="flex h-[30px] items-center gap-1.5 rounded-[7px] pr-2 pl-1 font-medium text-ink hover:bg-hover"
      >
        <Icon name={open ? "expand_more" : "chevron_right"} size={18} className="text-ink-3" />
        <Icon name={open ? "folder_open" : "folder"} size={17} className="text-ink-2" />
        {editing ? (
          <input
            autoFocus
            aria-label="Folder name"
            value={draft}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => actions.renameFolder(f.id, draft)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") actions.renameFolder(f.id, draft);
              if (e.key === "Escape") actions.startRename(null);
            }}
            className="h-6 min-w-0 flex-1 rounded-[5px] border border-a1 bg-surface px-1.5 text-[13px] font-semibold outline-0"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate">{f.name}</span>
        )}
        {!open && unread > 0 ? <span className="h-[7px] w-[7px] flex-none rounded-full bg-ink" aria-label={`${unread} unread`} /> : <span className="text-[12px] font-normal text-ink-3">{count}</span>}
      </div>
      {open && (
        <>
          {children}
          {f.items.length === 0 && <div className="flex h-7 items-center pl-[34px] text-[12px] text-ink-3">Drag here to add</div>}
        </>
      )}
    </div>
  );
}

type ItemDrag = { draggable: boolean; onDragStart: (e: DragEvent) => void; onDragEnd: () => void };
const itemCls = (on: boolean, strong: boolean) =>
  `flex h-[30px] w-full items-center gap-2 rounded-[7px] pr-2 text-left hover:bg-hover hover:text-ink ${on ? "bg-hover" : ""} ${on || strong ? "font-semibold text-ink" : "font-normal text-ink-2"}`;

function RoomItem({ room, indent, on, ...drag }: { room: Room; indent: number; on: boolean } & ItemDrag) {
  return (
    <Link href={`/rooms/${room.id}`} {...drag} className={itemCls(on, room.unread > 0)} style={{ paddingLeft: indent }} aria-current={on ? "page" : undefined}>
      <span className="w-[18px] flex-none text-center text-ink-3">#</span>
      <span className="min-w-0 flex-1 truncate">{room.name}</span>
      {room.unread > 0 && <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-ink px-[5px] text-[11px] font-semibold text-on-ink">{room.unread}</span>}
    </Link>
  );
}

function AgentItem({ agent: a, indent, on, meta, ...drag }: { agent: Agent; indent: number; on: boolean; meta: string } & ItemDrag) {
  return (
    <Link href={`/agents/${a.id}`} {...drag} className={itemCls(on, false)} style={{ paddingLeft: indent }} aria-current={on ? "page" : undefined}>
      <span className="relative grid h-[18px] w-[18px] flex-none place-items-center rounded-[5px] text-[10px] font-bold" style={tint(a.color)}>
        {a.name[0]}
        <span className="absolute -right-[3px] -bottom-[3px] h-2 w-2 rounded-full border-2 border-sunken" style={{ background: dotColor(a) }} />
      </span>
      <span className="min-w-0 flex-1 truncate">{a.name}</span>
      {meta && <span className="text-[11px] font-normal whitespace-nowrap text-ink-3">{meta}</span>}
    </Link>
  );
}
