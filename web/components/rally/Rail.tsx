"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { pendingApprovals, useRally } from "@/lib/rally/store";
import { btn, Icon } from "./primitives";

export default function Rail() {
  const { state, actions } = useRally();
  const path = usePathname();
  const pending = pendingApprovals(state).length;
  const items: [string, string, string, string][] = [
    ["rooms", "Rooms", "forum", `/rooms/${state.lastRoom}`],
    ["approvals", "Approvals", "inbox", "/approvals"],
    ["calendar", "Calendar", "calendar_month", "/calendar"],
    ["board", "Board", "view_kanban", "/board"],
    ["routines", "Routines", "event_repeat", "/routines"],
    ["activity", "Activity", "history", "/activity"],
    ["team", "Team", "group", "/team"],
  ];
  const isOn = (id: string) => path.startsWith(`/${id}`) || (id === "team" && path.startsWith("/agents"));
  const me = state.people.find((p) => p.id === state.me);

  return (
    <nav aria-label="Main" className="flex w-16 flex-none flex-col items-center gap-0.5 border-r border-line bg-sunken py-3">
      <div className="mb-1.5 grid h-8 w-8 place-items-center rounded-[9px] bg-ink text-[15px] font-semibold text-on-ink">R</div>
      {!state.treeOpen && (
        <button onClick={actions.toggleTree} title="Show sidebar" aria-label="Show sidebar" className={`${btn.icon} h-10 w-10`}>
          <Icon name="left_panel_open" />
        </button>
      )}
      {items.map(([id, label, icon, href]) => {
        const on = isOn(id);
        return (
          <Link key={id} href={href} title={label} aria-current={on ? "page" : undefined} className={`relative flex h-[50px] w-14 flex-col items-center justify-center gap-[3px] rounded-[10px] ${on ? "text-ink" : "text-ink-3 hover:text-ink"}`}>
            <span className={`grid h-7 w-10 place-items-center rounded-full ${on ? "bg-hover" : ""}`}>
              <Icon name={icon} />
            </span>
            <span className="text-[10.5px] leading-none" style={{ fontWeight: on ? 600 : 500 }}>
              {label}
            </span>
            {id === "approvals" && pending > 0 && (
              <span className="absolute top-0.5 right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-warn px-1 text-[10px] font-bold text-[#2b2210]">{pending}</span>
            )}
          </Link>
        );
      })}
      <span className="flex-1" />
      <button onClick={actions.openPalette} title="Search (⌘K)" aria-label="Search" className={`${btn.icon} h-10 w-10`}>
        <Icon name="search" />
      </button>
      <button onClick={actions.toggleTheme} title="Switch light / dark" aria-label="Switch light / dark" className={`${btn.icon} h-10 w-10`}>
        <Icon name={state.theme === "dark" ? "light_mode" : "dark_mode"} />
      </button>
      <Link href="/settings" title="Settings" aria-label="Settings" className={`${btn.icon} h-10 w-10 ${path.startsWith("/settings") ? "bg-hover" : ""}`}>
        <Icon name="tune" />
      </Link>
      <div title={me ? `${me.name} · ${me.access}` : ""} className="mt-1.5 grid h-[30px] w-[30px] place-items-center rounded-full bg-hover text-[11px] font-semibold">
        {me?.initials}
      </div>
    </nav>
  );
}
