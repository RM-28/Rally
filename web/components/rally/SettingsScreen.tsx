"use client";

import type { Perm, PermKey, Safety } from "@/lib/rally-types";
import { useRally } from "@/lib/rally/store";
import { Avatar, Icon, Segmented, Switch } from "./primitives";

const ACTIONS: [PermKey, string][] = [
  ["read", "Read room history"],
  ["draft", "Write docs"],
  ["tasks", "Create board tasks"],
  ["sched", "Add calendar events"],
  ["external", "Invite people outside the workspace"],
];
const CELL: Record<Perm, { label: string; bg: string; fg: string; line: string; icon: string }> = {
  allow: { label: "Allowed", bg: "var(--ok-bg)", fg: "var(--ok)", line: "transparent", icon: "check" },
  ask: { label: "Ask first", bg: "var(--warn-bg)", fg: "var(--warn-fg)", line: "transparent", icon: "front_hand" },
  off: { label: "Off", bg: "transparent", fg: "var(--ink-3)", line: "var(--line)", icon: "block" },
};
const SAFETY: [keyof Safety, string, string][] = [
  ["externalNeedsApproval", "Approve anything involving people outside the workspace", "Events with outside guests always go to Approvals, whatever an agent’s autonomy."],
  ["quietHours", "Quiet hours, 7 PM – 8 AM", "Agents ask before booking anything in quiet hours."],
  ["jobLimit", "Limit each agent to 20 tasks an hour", "Stops a runaway loop from piling up work. Turn off for heavy use."],
];

export default function SettingsScreen() {
  const { state, actions } = useRally();
  const cols = `minmax(200px,1.6fr) repeat(${state.agents.length}, minmax(108px,1fr))`;
  const minW = 220 + state.agents.length * 112;

  return (
    <section aria-label="Settings and permissions" className="min-w-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-[1000px] flex-col gap-8 px-7 pt-7 pb-12">
        <div>
          <h1 className="m-0 text-[24px] font-semibold">Settings</h1>
          <div className="text-ink-2">Workspace-wide rules. Changes apply to every room.</div>
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <div className="text-[16px] font-semibold">Agent permissions</div>
            <div className="text-[13px] text-ink-2">Click a cell to change it. Ask first sends the action to Approvals.</div>
          </div>
          <div className="overflow-auto rounded-[14px] border border-line bg-surface" role="table" aria-label="Agent permissions">
            <div role="row" className="grid border-b border-line bg-sunken" style={{ gridTemplateColumns: cols, minWidth: minW }}>
              <span role="columnheader" className="px-4 py-2.5 text-[12px] font-medium text-ink-3">
                Action
              </span>
              {state.agents.map((a) => (
                <span key={a.id} role="columnheader" className="flex items-center gap-2 px-3 py-2 text-[13px] font-semibold">
                  <Avatar id={a.id} size={22} radius={6} text={11} />
                  {a.name}
                </span>
              ))}
            </div>
            {ACTIONS.map(([k, label]) => (
              <div key={k} role="row" className="grid items-center border-b border-line last:border-b-0" style={{ gridTemplateColumns: cols, minWidth: minW, minHeight: "var(--row)" }}>
                <span role="rowheader" className="px-4 py-1.5">
                  {label}
                </span>
                {state.agents.map((a) => {
                  const v = state.permissions[a.id]?.[k] ?? "off";
                  const c = CELL[v];
                  return (
                    <span key={a.id} role="cell" className="px-3 py-1">
                      <button
                        onClick={() => actions.cyclePerm(a.id, k)}
                        aria-label={`${a.name}: ${label}: ${c.label}. Click to change.`}
                        className="inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold whitespace-nowrap"
                        style={{ background: c.bg, color: c.fg, borderColor: c.line }}
                      >
                        <Icon name={c.icon} size={16} />
                        {c.label}
                      </button>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="grid items-start gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-[18px]">
            <div className="text-[16px] font-semibold">Safety</div>
            {SAFETY.map(([k, t, d]) => (
              <div key={k} className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="font-medium">{t}</div>
                  <div className="text-[13px] text-pretty text-ink-2">{d}</div>
                </div>
                <Switch on={state.safety[k]} onChange={() => actions.toggleSafety(k)} label={t} />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-[18px]">
            <div className="text-[16px] font-semibold">Appearance</div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[120px] flex-1">
                <div className="font-medium">Theme</div>
                <div className="text-[13px] text-ink-2">Light or dark</div>
              </div>
              <Segmented options={[["light", "Light"], ["dark", "Dark"]]} value={state.theme} onChange={(theme) => actions.patch({ theme })} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[120px] flex-1">
                <div className="font-medium">Density</div>
                <div className="text-[13px] text-ink-2">Compact fits more rows</div>
              </div>
              <Segmented options={[["comfortable", "Comfortable"], ["compact", "Compact"]]} value={state.density} onChange={(density) => actions.patch({ density })} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
