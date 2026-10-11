"use client";

import { useEffect, useState } from "react";
import { RALLY_BASE } from "@/lib/rally/api";
import { RallyProvider, useRally } from "@/lib/rally/store";
import CommandPalette from "./CommandPalette";
import NewAgentDrawer from "./NewAgentDrawer";
import { btn } from "./primitives";
import Rail from "./Rail";
import Sidebar from "./Sidebar";

/** App shell: Rail + Sidebar + main + overlays. Nothing scrolls at body level. */
export default function RallyShell({ children }: { children: React.ReactNode }) {
  return (
    <RallyProvider>
      <ShellInner>{children}</ShellInner>
    </RallyProvider>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const { state, actions } = useRally();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        actions.togglePalette();
      } else if (e.key === "Escape") actions.closeOverlays();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions]);

  const frame = "relative flex h-screen overflow-hidden bg-bg font-rally text-[14px] leading-[1.45] text-ink";

  // Hold a blank frame until the workspace loads, so nothing renders against empty data.
  if (state.status === "loading") return <div data-app="rally" data-theme={state.theme} className={frame} />;

  if (state.status === "offline") {
    return (
      <div data-app="rally" data-theme={state.theme} className={`${frame} items-center justify-center p-6`}>
        <div className="flex max-w-[460px] flex-col gap-3 rounded-2xl border border-line bg-surface p-6 shadow-rally">
          <div className="text-[16px] font-semibold">Can’t reach the Rally engine</div>
          <div className="text-ink-2">
            Rally loads everything from the engine at <span className="font-code text-[12px]">{RALLY_BASE}</span>. Start it from the repo root:
          </div>
          <pre className="m-0 overflow-auto rounded-lg bg-sunken p-3 font-code text-[12px]">uvicorn engine.api:app --port 8000</pre>
          <div className="text-[12px] text-ink-3">Error: {state.error}</div>
          <button onClick={actions.retry} className={`${btn.primary} self-start`}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-app="rally" data-theme={state.theme} data-density={state.density} className={frame}>
      <Rail />
      {state.treeOpen && <Sidebar />}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
      {state.palette && <CommandPalette />}
      {state.createOpen && <NewAgentDrawer />}
      {state.toast && (
        <div role="alert" className="absolute bottom-5 left-1/2 z-50 max-w-[min(560px,calc(100%-32px))] -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 text-[13px] text-on-ink shadow-rally">
          {state.toast}
        </div>
      )}
    </div>
  );
}

export function useViewportWidth() {
  const [vw, setVw] = useState(() => (typeof window === "undefined" ? 1400 : window.innerWidth));
  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return vw;
}
