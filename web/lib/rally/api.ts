// Client for the engine's Rally routes (engine/rally/routes.py, mounted at /api/rally).
import { API_URL } from "@/lib/config";
import type { Agent, Approval, Autonomy, Bootstrap, CalendarEvent, CatchUp, Doc, Folder, Message, Perm, PermKey, Routine, Safety } from "@/lib/rally-types";

/** No sign-in yet: the engine trusts this header. */
export const RALLY_USER = process.env.NEXT_PUBLIC_RALLY_USER ?? "test";
export const RALLY_BASE = `${API_URL}/api/rally`;
export const STREAM_URL = `${RALLY_BASE}/stream`;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(RALLY_BASE + path, {
    method,
    // the engine schedules in this browser's time zone
    headers: { "Content-Type": "application/json", "X-Rally-User": RALLY_USER, "X-Rally-TZ": Intl.DateTimeFormat().resolvedOptions().timeZone },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {}
    throw new Error(`${res.status} ${detail}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  bootstrap: () => call<Bootstrap>("GET", "/bootstrap"),
  postMessage: (roomId: string, text: string) => call<Message>("POST", `/rooms/${roomId}/messages`, { text }),
  markRead: (roomId: string) => call<{ ok: boolean }>("POST", `/rooms/${roomId}/read`),
  catchup: (roomId: string) => call<CatchUp>("POST", `/rooms/${roomId}/catchup`),
  setMemory: (msgId: string, undone: boolean) => call<Message>("PATCH", `/messages/${msgId}`, { undone }),
  resolve: (id: string, status: Approval["status"], alwaysAllow = false) => call<Approval>("POST", `/approvals/${id}`, { status, alwaysAllow }),
  patchAgent: (id: string, patch: { autonomy?: Autonomy; paused?: boolean }) => call<Agent>("PATCH", `/agents/${id}`, patch),
  createAgent: (a: { name: string; role: string; autonomy: Autonomy }) => call<Agent>("POST", "/agents", a),
  putFolders: (folders: Folder[], starred: string[]) => call<{ ok: boolean }>("PUT", "/folders", { folders, starred }),
  putPermissions: (agentId: string, perms: Partial<Record<PermKey, Perm>>) => call<Record<PermKey, Perm>>("PUT", `/permissions/${agentId}`, perms),
  patchSafety: (patch: Partial<Safety>) => call<Safety>("PATCH", "/safety", patch),
  createRoutine: (r: Partial<Routine> = {}) => call<Routine>("POST", "/routines", r),
  patchRoutine: (id: string, patch: Partial<Routine>) => call<Routine>("PATCH", `/routines/${id}`, patch),
  runRoutine: (id: string) => call<{ ok: boolean }>("POST", `/routines/${id}/run`),
  doc: (id: string) => call<Doc>("GET", `/docs/${id}`),
  createEvent: (e: { title: string; start: string; end: string; roomId?: string | null; guests?: string[]; notes?: string }) => call<CalendarEvent>("POST", "/calendar", e),
  deleteEvent: (id: string) => call<{ ok: boolean }>("DELETE", `/calendar/${id}`),
};
