"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import Remote from "@/components/Remote";
import { btn, Icon } from "@/components/rally/primitives";
import { APP_NAME } from "@/lib/config";
import { useBoard } from "./BoardProvider";
import RunHeader from "./RunHeader";
import StrategyDrawer from "./StrategyDrawer";

const FRAME = "relative flex h-screen overflow-hidden bg-bg font-rally text-[14px] leading-[1.45] text-ink";

const RAIL: [string, string, string][] = [
  ["/", "Live", "monitoring"],
  ["/results", "Results", "trophy"],
  ["/lineage", "Lineage", "account_tree"],
  ["/schedule", "Schedule", "calendar_month"],
];

const initialsOf = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

function Rail() {
  const { theme, toggleTheme, name, state } = useBoard();
  const path = usePathname();
  const appName = state?.app_name ?? APP_NAME;
  return (
    <nav aria-label="Main" className="flex w-16 flex-none flex-col items-center gap-0.5 border-r border-line bg-sunken py-3">
      <div className="mb-2 grid h-8 w-8 place-items-center rounded-[9px] bg-ink text-[15px] font-semibold text-on-ink">{appName[0]}</div>
      {RAIL.map(([href, label, icon]) => {
        const on = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link key={href} href={href} title={label} aria-current={on ? "page" : undefined} className={`flex h-[50px] w-14 flex-col items-center justify-center gap-[3px] rounded-[10px] ${on ? "text-ink" : "text-ink-3 hover:text-ink"}`}>
            <span className={`grid h-7 w-10 place-items-center rounded-full ${on ? "bg-hover" : ""}`}>
              <Icon name={icon} />
            </span>
            <span className="text-[10.5px] leading-none" style={{ fontWeight: on ? 600 : 500 }}>
              {label}
            </span>
          </Link>
        );
      })}
      <span className="flex-1" />
      <button onClick={toggleTheme} title="Switch light / dark" aria-label="Switch light / dark" className={`${btn.icon} h-10 w-10`}>
        <Icon name={theme === "dark" ? "light_mode" : "dark_mode"} />
      </button>
      <div title={`You are ${name}`} className="mt-1.5 grid h-[30px] w-[30px] place-items-center rounded-full bg-hover text-[11px] font-semibold">
        {initialsOf(name)}
      </div>
    </nav>
  );
}

function JoinCard() {
  const { setName, state } = useBoard();
  const [draft, setDraft] = useState("");
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <form
        className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-line bg-surface p-6 shadow-rally"
        onSubmit={(e) => {
          e.preventDefault();
          const n = draft.trim().slice(0, 40);
          if (n) setName(n);
        }}
      >
        <div className="text-[22px] font-semibold">{state?.app_name ?? APP_NAME}</div>
        <div className="text-ink-2">A team of AI bots is improving a schedule live. What should we call you?</div>
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Your name" maxLength={40} className="h-10 rounded-[10px] border border-line-strong bg-bg px-3 text-[16px] outline-none sm:text-[14px]" />
        <button className={`${btn.primary} h-10 justify-center`}>Join</button>
      </form>
    </div>
  );
}

export default function BoardShell({ children }: { children: React.ReactNode }) {
  const { ready, name, theme, view, setView, drawer } = useBoard();

  if (!ready) return <div data-app="rally" data-theme={theme} className={FRAME} />;
  if (!name)
    return (
      <div data-app="rally" data-theme={theme} className={FRAME}>
        <JoinCard />
      </div>
    );
  if (view === "remote")
    return (
      <div data-app="rally" data-theme={theme} className="min-h-screen bg-bg font-rally text-[14px] leading-[1.45] text-ink">
        <Remote />
      </div>
    );

  return (
    <div data-app="rally" data-theme={theme} className={FRAME}>
      <Rail />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <RunHeader />
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
      <button onClick={() => setView("remote")} className={`${btn.primary} fixed right-4 bottom-4 z-40 h-11 rounded-full px-5 shadow-rally md:hidden`}>
        Message the bots
      </button>
      {drawer && <StrategyDrawer id={drawer} />}
    </div>
  );
}
