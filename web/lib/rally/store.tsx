"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  ActivityRow, Agent, AlwaysRule, Approval, Autonomy, Bootstrap, CalendarEvent, CatchUp, FileRef, Folder, Job, Message, PermKey, Permissions, Person, RallyEvent,
  Room, Routine, Safety, Task,
} from "@/lib/rally-types";
import { api, RALLY_USER, STREAM_URL } from "@/lib/rally/api";
import { uid } from "@/lib/rally/format";
import { DEFAULT_ROOM } from "@/lib/rally/seed-ids";

export type Theme = "light" | "dark";
export type Density = "comfortable" | "compact";

type Data = {
  me: string;
  workspace: { name: string };
  calendar: CalendarEvent[];
  people: Person[];
  agents: Agent[];
  rooms: Room[];
  folders: Folder[];
  starred: string[];
  messages: Record<string, Message[]>;
  files: Record<string, FileRef[]>;
  approvals: Record<string, Approval>;
  jobs: Job[];
  tasks: Task[];
  routines: Routine[];
  activity: ActivityRow[];
  permissions: Permissions;
  safety: Safety;
  alwaysRules: AlwaysRule[];
};

export type RallyState = Data & {
  status: "loading" | "ready" | "offline";
  live: boolean;
  error: string | null;
  toast: string | null;
  alwaysAllow: Record<string, boolean>;
  typing: Record<string, string>;
  catchup: Record<string, CatchUp | null>;
  catchLoading: string | null;
  draft: string;
  lastRoom: string;
  activeRoom: string | null;
  // shell UI
  theme: Theme;
  density: Density;
  treeOpen: boolean;
  treeFilter: "all" | "unread";
  panelOpen: boolean;
  panelTab: "live" | "people" | "files";
  palette: boolean;
  createOpen: boolean;
  editFolder: string | null;
};

type LocalPrefs = Pick<RallyState, "theme" | "density" | "treeOpen" | "lastRoom">;
const PREFS_KEY = `rally:prefs:${RALLY_USER}`;

const EMPTY: Data = {
  me: RALLY_USER, workspace: { name: "" }, calendar: [], people: [], agents: [], rooms: [], folders: [], starred: [], messages: {}, files: {}, approvals: {}, jobs: [], tasks: [],
  routines: [], activity: [], permissions: {}, safety: { externalNeedsApproval: true, quietHours: true, jobLimit: true }, alwaysRules: [],
};

function initialState(): RallyState {
  return {
    ...EMPTY, status: "loading", live: false, error: null, toast: null, alwaysAllow: {}, typing: {}, catchup: {}, catchLoading: null, draft: "",
    lastRoom: DEFAULT_ROOM, activeRoom: null, theme: "light", density: "comfortable", treeOpen: true, treeFilter: "all", panelOpen: true,
    panelTab: "live", palette: false, createOpen: false, editFolder: null,
  };
}

function fromBootstrap(b: Bootstrap): Data {
  return { ...b, approvals: Object.fromEntries(b.approvals.map((a) => [a.id, a])) };
}

const upsert = <T extends { id: string }>(list: T[], item: T, atStart = false) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : atStart ? [item, ...list] : [...list, item];

/** Applies one server event. Every event is an upsert or a patch, so a replay is harmless. */
export function applyEvent(s: RallyState, e: RallyEvent): RallyState {
  switch (e.type) {
    case "message": {
      const m = e.data;
      const list = s.messages[m.roomId] ?? [];
      const isNew = !list.some((x) => x.id === m.id);
      const unreadBump = isNew && m.kind === "msg" && m.author !== s.me && s.activeRoom !== m.roomId;
      return {
        ...s,
        messages: { ...s.messages, [m.roomId]: upsert(list, m) },
        rooms: unreadBump ? s.rooms.map((r) => (r.id === m.roomId ? { ...r, unread: r.unread + 1 } : r)) : s.rooms,
      };
    }
    case "agent": {
      const known = s.agents.some((a) => a.id === e.data.id);
      return { ...s, agents: upsert(s.agents, e.data), folders: known ? s.folders : addToFirstFolder(s.folders, "agent", e.data.id) };
    }
    case "agent_status":
      return { ...s, agents: s.agents.map((a) => (a.id === e.data.id ? { ...a, ...e.data } : a)) };
    case "job_progress":
      return { ...s, jobs: upsert(s.jobs, e.data) };
    case "task":
      return { ...s, tasks: upsert(s.tasks, e.data) };
    case "task_removed":
      return { ...s, tasks: s.tasks.filter((t) => t.id !== e.data.id) };
    case "calendar_event":
      return { ...s, calendar: upsert(s.calendar, e.data).sort((a, b) => a.start.localeCompare(b.start)) };
    case "calendar_removed":
      return { ...s, calendar: s.calendar.filter((ev) => ev.id !== e.data.id) };
    case "typing": {
      const typing = { ...s.typing };
      if (e.data.text) typing[e.data.roomId] = e.data.text;
      else delete typing[e.data.roomId];
      return { ...s, typing };
    }
    case "files":
      return { ...s, files: { ...s.files, [e.data.roomId]: e.data.files } };
    case "approval_requested":
      return { ...s, approvals: { ...s.approvals, [e.data.id]: e.data } };
    case "approval_resolved": {
      const cur = s.approvals[e.data.id];
      return cur ? { ...s, approvals: { ...s.approvals, [cur.id]: { ...cur, ...e.data } } } : s;
    }
    case "always_rules":
      return { ...s, alwaysRules: e.data };
    case "routine":
      return { ...s, routines: upsert(s.routines, e.data) };
    case "activity":
      return { ...s, activity: upsert(s.activity, e.data, true) };
    case "activity_removed":
      return { ...s, activity: s.activity.filter((r) => r.id !== e.data.id) };
    case "permissions":
      return { ...s, permissions: { ...s.permissions, [e.data.agentId]: e.data.perms } };
    case "safety":
      return { ...s, safety: e.data };
  }
  return s;
}

function addToFirstFolder(folders: Folder[], kind: Folder["kind"], id: string): Folder[] {
  if (folders.some((f) => f.items.includes(id))) return folders;
  const first = folders.filter((f) => f.kind === kind).sort((a, b) => a.order - b.order)[0];
  return folders.map((f) => (f.id === first?.id ? { ...f, open: true, items: [...f.items, id] } : f));
}

const PERM_NEXT = { allow: "ask", ask: "off", off: "allow" } as const;

function useRallyStore() {
  const [state, setState] = useState<RallyState>(initialState);
  const ref = useRef(state);
  ref.current = state;
  const [attempt, setAttempt] = useState(0);

  const toast = useCallback((msg: string) => {
    setState((s) => ({ ...s, toast: msg }));
    setTimeout(() => setState((s) => (s.toast === msg ? { ...s, toast: null } : s)), 5000);
  }, []);
  /** Runs an API call; on failure shows a toast and, if given, undoes the optimistic change. */
  const attemptCall = useCallback(
    <T,>(p: Promise<T>, what: string, rollback?: () => void) =>
      p.catch((err: Error) => {
        rollback?.();
        toast(`Couldn’t ${what}: ${err.message}`);
        return undefined;
      }),
    [toast],
  );

  // local prefs, then the first load
  useEffect(() => {
    let saved: Partial<LocalPrefs> = {};
    try {
      saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    } catch {}
    const vw = window.innerWidth;
    setState((s) => ({ ...s, ...saved, treeOpen: saved.treeOpen ?? vw >= 860, panelOpen: vw >= 1320 }));
  }, []);

  const load = useCallback(async () => {
    try {
      const b = await api.bootstrap();
      setState((s) => ({
        ...s, ...fromBootstrap(b), status: "ready", error: null,
        lastRoom: b.rooms.some((r) => r.id === s.lastRoom) ? s.lastRoom : (b.rooms[0]?.id ?? DEFAULT_ROOM),
      }));
    } catch (err) {
      setState((s) => (s.status === "ready" ? { ...s, live: false } : { ...s, status: "offline", error: (err as Error).message }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, attempt]);

  // live feed: one EventSource for the whole shell. After a dropped connection, reload everything to resync.
  useEffect(() => {
    if (state.status !== "ready") return;
    const es = new EventSource(STREAM_URL);
    let dropped = false;
    es.onopen = () => {
      setState((s) => ({ ...s, live: true }));
      if (dropped) load();
      dropped = false;
    };
    es.onerror = () => {
      dropped = true;
      setState((s) => ({ ...s, live: false }));
    };
    let readTimer: ReturnType<typeof setTimeout> | undefined;
    es.onmessage = (msg) => {
      try {
        const e = JSON.parse(msg.data) as RallyEvent;
        if (!e || !e.type) return;
        setState((s) => applyEvent(s, e));
        // a message landing in the room you're looking at counts as read
        const room = ref.current.activeRoom;
        if (e.type === "message" && room && e.data.roomId === room) {
          clearTimeout(readTimer);
          readTimer = setTimeout(() => api.markRead(room).catch(() => {}), 800);
        }
      } catch {}
    };
    return () => {
      clearTimeout(readTimer);
      es.close();
    };
  }, [state.status, load]);

  // persist local prefs
  useEffect(() => {
    if (state.status === "loading") return;
    const prefs: LocalPrefs = { theme: state.theme, density: state.density, treeOpen: state.treeOpen, lastRoom: state.lastRoom };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {}
  }, [state.status, state.theme, state.density, state.treeOpen, state.lastRoom]);

  // folders and stars are saved per user on the server, debounced. Skip the first run (that's the bootstrap itself).
  const foldersReady = useRef(false);
  useEffect(() => {
    if (state.status !== "ready") return;
    if (!foldersReady.current) {
      foldersReady.current = true;
      return;
    }
    const t = setTimeout(() => attemptCall(api.putFolders(state.folders, state.starred), "save your folders"), 600);
    return () => clearTimeout(t);
  }, [state.status, state.folders, state.starred, attemptCall]);

  const actions = useMemo(() => {
    const patch = (p: Partial<RallyState> | ((s: RallyState) => Partial<RallyState>)) => setState((s) => ({ ...s, ...(typeof p === "function" ? p(s) : p) }));
    const updateFolders = (fn: (f: Folder[]) => Folder[]) => patch((s) => ({ folders: fn(s.folders) }));
    const updateAgent = (id: string, p: Partial<Agent>) => patch((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, ...p } : a)) }));
    return {
      patch,
      retry: () => {
        patch({ status: "loading" });
        setAttempt((n) => n + 1);
      },
      setDraft: (draft: string) => patch({ draft }),
      send: (roomId: string, raw: string) => {
        const text = raw.trim();
        if (!text) return;
        patch({ draft: "" });
        api.postMessage(roomId, text).then(
          (m) => setState((s) => applyEvent(s, { type: "message", data: m })),
          (err: Error) => {
            patch((s) => ({ draft: s.draft || text }));
            toast(`Couldn’t send: ${err.message}`);
          },
        );
      },
      visitRoom: (id: string) => {
        patch((s) => ({ lastRoom: id, activeRoom: id, rooms: s.rooms.map((r) => (r.id === id && r.unread ? { ...r, unread: 0 } : r)) }));
        attemptCall(api.markRead(id), "mark the room read");
      },
      leaveRoom: (id: string) => {
        patch((s) => (s.activeRoom === id ? { activeRoom: null } : {}));
        attemptCall(api.markRead(id), "mark the room read");
      },
      runCatchup: (roomId: string) => {
        if (ref.current.catchLoading) return;
        patch({ catchLoading: roomId });
        api.catchup(roomId).then(
          (c) => patch((s) => ({ catchLoading: null, catchup: { ...s.catchup, [roomId]: c } })),
          (err: Error) => {
            patch({ catchLoading: null });
            toast(`Catch up failed: ${err.message}`);
          },
        );
      },
      closeCatchup: (roomId: string) => patch((s) => ({ catchup: { ...s.catchup, [roomId]: null } })),
      resolveApproval: (id: string, status: Approval["status"]) => {
        const s = ref.current;
        const before = s.approvals[id];
        if (!before) return;
        setState((st) =>
          applyEvent(st, { type: "approval_resolved", data: { id, status, resolvedBy: status === "pending" ? null : st.me, resolvedAt: status === "pending" ? null : new Date().toISOString() } }),
        );
        attemptCall(api.resolve(id, status, status === "approved" && !!s.alwaysAllow[id]), "update the approval", () =>
          setState((st) => applyEvent(st, { type: "approval_resolved", data: before })),
        );
      },
      toggleAlways: (id: string) => patch((s) => ({ alwaysAllow: { ...s.alwaysAllow, [id]: !s.alwaysAllow[id] } })),
      toggleMemory: (roomId: string, msgId: string) => {
        const m = (ref.current.messages[roomId] ?? []).find((x) => x.id === msgId);
        if (!m || m.kind !== "memory") return;
        const next = { ...m, undone: !m.undone };
        setState((s) => applyEvent(s, { type: "message", data: next }));
        attemptCall(api.setMemory(msgId, next.undone), "update the memory", () => setState((s) => applyEvent(s, { type: "message", data: m })));
      },
      setAutonomy: (agentId: string, autonomy: Autonomy) => {
        const prev = ref.current.agents.find((a) => a.id === agentId)?.autonomy;
        updateAgent(agentId, { autonomy });
        attemptCall(api.patchAgent(agentId, { autonomy }), "change autonomy", () => prev && updateAgent(agentId, { autonomy: prev }));
      },
      togglePause: (agentId: string) => {
        const a = ref.current.agents.find((x) => x.id === agentId);
        if (!a) return;
        updateAgent(agentId, { paused: !a.paused });
        attemptCall(api.patchAgent(agentId, { paused: !a.paused }), a.paused ? "resume the agent" : "pause the agent", () => updateAgent(agentId, { paused: a.paused }));
      },
      cyclePerm: (agentId: string, key: PermKey) => {
        const cur = ref.current.permissions[agentId] ?? ({} as Permissions[string]);
        const next = PERM_NEXT[cur[key] ?? "off"];
        patch((s) => ({ permissions: { ...s.permissions, [agentId]: { ...cur, [key]: next } } }));
        attemptCall(api.putPermissions(agentId, { [key]: next }), "change the permission", () => patch((s) => ({ permissions: { ...s.permissions, [agentId]: cur } })));
      },
      toggleSafety: (key: keyof Safety) => {
        const prev = ref.current.safety;
        patch({ safety: { ...prev, [key]: !prev[key] } });
        attemptCall(api.patchSafety({ [key]: !prev[key] }), "change the safety setting", () => patch({ safety: prev }));
      },
      // shell
      toggleTheme: () => patch((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
      toggleTree: () => patch((s) => ({ treeOpen: !s.treeOpen })),
      togglePanel: () => patch((s) => ({ panelOpen: !s.panelOpen })),
      openPalette: () => patch({ palette: true }),
      togglePalette: () => patch((s) => ({ palette: !s.palette })),
      closeOverlays: () => patch({ palette: false, createOpen: false }),
      toggleStar: (id: string) => patch((s) => ({ starred: s.starred.includes(id) ? s.starred.filter((x) => x !== id) : [id, ...s.starred] })),
      // folders (saved by the debounced effect above)
      toggleFolder: (id: string) => updateFolders((fs) => fs.map((f) => (f.id === id ? { ...f, open: !f.open } : f))),
      renameFolder: (id: string, name: string) =>
        patch((s) => ({ editFolder: null, folders: name.trim() ? s.folders.map((f) => (f.id === id ? { ...f, name: name.trim() } : f)) : s.folders })),
      startRename: (id: string | null) => patch({ editFolder: id }),
      addFolder: (kind: Folder["kind"]) => {
        const id = uid("f");
        patch((s) => ({
          treeFilter: "all",
          editFolder: id,
          folders: [...s.folders, { id, name: "New folder", kind, items: [], open: true, order: Math.max(-1, ...s.folders.filter((f) => f.kind === kind).map((f) => f.order)) + 1 }],
        }));
      },
      moveItem: (kind: Folder["kind"], itemId: string, folderId: string) =>
        updateFolders((fs) =>
          fs.map((f) => {
            if (f.kind !== kind) return f;
            if (f.id === folderId) return { ...f, open: true, items: f.items.includes(itemId) ? f.items : [...f.items, itemId] };
            return { ...f, items: f.items.filter((x) => x !== itemId) };
          }),
        ),
      // routines
      toggleRoutine: (id: string) => {
        const r = ref.current.routines.find((x) => x.id === id);
        if (!r) return;
        patch((s) => ({ routines: s.routines.map((x) => (x.id === id ? { ...x, enabled: !r.enabled } : x)) }));
        attemptCall(api.patchRoutine(id, { enabled: !r.enabled }), "update the routine", () => patch((s) => ({ routines: s.routines.map((x) => (x.id === id ? r : x)) })));
      },
      runRoutine: (id: string) => attemptCall(api.runRoutine(id), "run the routine"),
      addRoutine: () => attemptCall(api.createRoutine({ agentId: ref.current.agents[0]?.id, roomId: ref.current.rooms.at(-1)?.id }), "add a routine"),
      createEvent: async (ev: { title: string; start: string; end: string; roomId?: string | null; guests?: string[]; notes?: string }) => {
        const created = await attemptCall(api.createEvent(ev), "add the event");
        if (created) setState((s) => applyEvent(s, { type: "calendar_event", data: created }));
        return created ?? null;
      },
      deleteEvent: (id: string) => {
        const before = ref.current.calendar.find((e) => e.id === id);
        setState((s) => applyEvent(s, { type: "calendar_removed", data: { id } }));
        attemptCall(api.deleteEvent(id), "remove the event", () => before && setState((s) => applyEvent(s, { type: "calendar_event", data: before })));
      },
      createAgent: async (opts: { name: string; role: string; autonomy: Autonomy }) => {
        const a = await attemptCall(api.createAgent(opts), "create the agent");
        if (!a) return null;
        setState((s) => ({ ...applyEvent(s, { type: "agent", data: a }), createOpen: false }));
        return a.id;
      },
    };
  }, [attemptCall, toast]);

  return { state, actions };
}

type Store = ReturnType<typeof useRallyStore>;
const Ctx = createContext<Store | null>(null);

export function RallyProvider({ children }: { children: React.ReactNode }) {
  const store = useRallyStore();
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useRally() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRally must be used inside RallyProvider");
  return v;
}

export type Who = { id: string; name: string; init: string; isAgent: boolean; role: string; color?: Agent["color"]; agent?: Agent; person?: Person };

export function whoOf(s: RallyState, id: string): Who {
  const a = s.agents.find((x) => x.id === id);
  if (a) return { id, name: a.name, init: a.name[0], isAgent: true, role: a.role, color: a.color, agent: a };
  const p = s.people.find((x) => x.id === id);
  return p ? { id, name: p.name, init: p.initials, isAgent: false, role: p.role, person: p } : { id, name: id, init: "?", isAgent: false, role: "" };
}

export const pendingApprovals = (s: RallyState) => Object.values(s.approvals).filter((a) => a.status === "pending");

/** Jobs shown in Live work: running, or finished in the last 10 minutes. */
export const visibleJobs = (s: RallyState) => s.jobs.filter((j) => j.pct < 100 || (j.finishedAt && Date.now() - Date.parse(j.finishedAt) < 10 * 60_000));
