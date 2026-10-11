"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Autonomy } from "@/lib/rally-types";
import { AUTONOMY } from "@/lib/rally/format";
import { useRally } from "@/lib/rally/store";
import { btn, Icon, Segmented } from "./primitives";

const TEMPLATES: [string, string, string, string][] = [
  ["research", "Research", "Find and summarize", "Scout"],
  ["writing", "Writing", "Summaries, briefs, plans", "Quill"],
  ["scheduling", "Scheduling", "Meetings and focus time", "Relay"],
  ["reports", "Reporting", "Weekly numbers", "Tally"],
  ["custom", "Custom", "Start blank", "Nova"],
];
const SPARE_NAMES = ["Nova", "Iris", "Sage", "Orbit", "Fern", "Pixel", "Juno", "Wren", "Bolt", "Lumen"];

export default function NewAgentDrawer() {
  const { state, actions } = useRally();
  const router = useRouter();
  const [tpl, setTpl] = useState("research");
  const [name, setName] = useState("");
  const [aut, setAut] = useState<Autonomy>("ask");
  const t = TEMPLATES.find((x) => x[0] === tpl) ?? TEMPLATES[0];
  // suggest the template's name, or the first spare one if an agent already has it
  const taken = new Set(state.agents.map((a) => a.name.toLowerCase()));
  const suggestion = [t[3], ...SPARE_NAMES].find((n) => !taken.has(n.toLowerCase())) ?? "Agent";
  const close = () => actions.patch({ createOpen: false });
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    const id = await actions.createAgent({ name: name.trim() || suggestion, role: tpl === "custom" ? "Custom" : t[1], autonomy: aut });
    setBusy(false);
    if (id) router.push(`/agents/${id}`);
  };

  return (
    <>
      <div onClick={close} className="absolute inset-0 z-40" style={{ background: "rgb(41 37 30 / .28)" }} />
      <div role="dialog" aria-modal="true" aria-labelledby="new-agent-title" className="absolute top-3 right-3 bottom-3 z-50 flex w-[min(440px,calc(100%-24px))] flex-col overflow-hidden rounded-[20px] border border-line bg-surface shadow-rally">
        <div className="flex items-center border-b border-line px-5 py-[18px]">
          <div id="new-agent-title" className="flex-1 text-[18px] font-semibold">
            New agent
          </div>
          <button onClick={close} title="Close" aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-hover">
            <Icon name="close" />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-5 overflow-auto p-5">
          <div className="flex flex-col gap-2">
            <div className="font-medium">Start from a role</div>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map(([id, l, d]) => (
                <button
                  key={id}
                  onClick={() => setTpl(id)}
                  aria-pressed={tpl === id}
                  className={`rounded-xl border px-3 py-2.5 text-left hover:border-ink-3 ${tpl === id ? "border-ink bg-sunken" : "border-line"}`}
                >
                  <span className="block font-semibold">{l}</span>
                  <span className="block text-[12px] text-ink-2">{d}</span>
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={suggestion} className="h-10 rounded-[10px] border border-line-strong bg-bg px-3 outline-0" />
          </label>
          <div className="flex flex-col gap-2">
            <span className="font-medium">Autonomy</span>
            <Segmented full options={[["ask", "Ask first"], ["limits", "Within limits"], ["act", "Act & report"]]} value={aut} onChange={setAut} />
            <div className="text-[13px] text-ink-2">{AUTONOMY[aut].desc}</div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
          <button onClick={close} className={`${btn.outline} h-[38px]`}>
            Cancel
          </button>
          <button onClick={create} disabled={busy} className={`${btn.primary} h-[38px] px-4 disabled:opacity-60`}>
            {busy ? "Creating…" : "Create agent"}
          </button>
        </div>
      </div>
    </>
  );
}
