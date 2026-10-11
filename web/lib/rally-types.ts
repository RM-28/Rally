// Data model for Rally. Each Mongo collection matches one of these types.
export type Autonomy = "ask" | "limits" | "act";
export type AgentStatus = "working" | "waiting" | "idle";
export type Perm = "allow" | "ask" | "off";
export type PermKey = "read" | "draft" | "tasks" | "sched" | "external";
export type AgentColor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type Person = { id: string; name: string; initials: string; role: string; email: string; access: "Admin" | "Member" | "Guest"; lastActive: string };
export type Agent = {
  id: string; name: string; role: string; color: AgentColor; autonomy: Autonomy; status: AgentStatus; now: string; paused: boolean;
  does: string; tools: string[]; memory: string[]; recent: { t: string; d?: string; ts?: string }[];
};
export type Room = { id: string; name: string; topic: string; people: string[]; agents: string[]; unread: number; files?: FileRef[] };
export type Folder = { id: string; name: string; kind: "room" | "agent"; items: string[]; open: boolean; order: number };

export type Message =
  | { kind: "msg"; id: string; roomId: string; author: string; ts: string; text: string; bullets?: string[]; file?: FileRef; task?: { title: string; done: boolean }; approvalId?: string; eventId?: string }
  | { kind: "memory"; id: string; roomId: string; ts: string; agentId: string; text: string; undone: boolean }
  | { kind: "handoff"; id: string; roomId: string; ts: string; from: string; to: string; text: string };

/** url is a Rally doc id when the agent wrote the file; seeded files have none. */
export type FileRef = { name: string; meta: string; icon: "description" | "article" | "table_chart" | "picture_as_pdf" | "folder"; url?: string };
export type Doc = { id: string; title: string; body: string; agentId: string; roomId: string; ts: string };

export type Approval = {
  id: string; agentId: string; roomId: string; title: string; createdAt: string;
  /** what the agent wants to do: "event" (book on the Rally calendar) or "tasks" (add board cards) */
  kind?: string;
  risk: "External" | "Calendar" | "Board" | string;
  rule: string; why: string; rows: { k: string; v: string }[]; body?: string | null; alwaysAllowLabel?: string | null;
  /** What the agent's status line says once this goes through. */
  doneText?: string | null;
  status: "pending" | "approved" | "declined"; resolvedBy?: string | null; resolvedAt?: string | null;
};

export type JobStep = { t: string; state: "done" | "active" | "todo" };
export type SheetRow = { deal: string; stage: string; value: string; live?: boolean };
export type Job = {
  id: string; agentId: string; roomId: string; title: string; step: string; pct: number; startedAt: string; finishedAt?: string; preview?: "doc" | "sheet";
  doc?: { title: string; lines: string[] }; sheet?: SheetRow[]; steps?: JobStep[];
  /** Shown under the thread while the job runs, e.g. "Scout is reading competitor sites…" */
  typing?: string | null;
};
export type Task = { id: string; title: string; owner: string; roomId: string; due: string; column: "queued" | "in_progress" | "review" | "done"; flag?: string; approvalId?: string; jobId?: string; createdAt?: string };
/** lastRun is the outcome ("Done", "Running…", "Never run"); lastRunAt is when. */
export type Routine = { id: string; name: string; description: string; agentId: string; schedule: string; cron: string; roomId: string; lastRun: string; lastRunAt?: string; enabled: boolean };
export type ActivityResult = "Auto" | "Within limits" | "Setting" | "Waiting" | "Approved" | "Declined";
export type ActivityRow = { id: string; ts: string; actor: string; action: string; roomId?: string; result?: ActivityResult; /** result follows this approval's status */ approvalId?: string };
export type Permissions = Record<string /* agentId */, Record<PermKey, Perm>>;
export type Safety = { externalNeedsApproval: boolean; quietHours: boolean; jobLimit: boolean };

/** An event on the Rally calendar. Times are UTC ISO strings; tentative means it is waiting for approval. */
export type CalendarEvent = {
  id: string; title: string; start: string; end: string; roomId?: string | null; attendees: string[]; guests: string[]; notes: string;
  createdBy: string; status: "confirmed" | "tentative" | "cancelled"; approvalId?: string;
};
export type CatchUp = { meta: string; points: string[]; approvalId?: string; ask?: string };
export type AlwaysRule = { agentId: string; kind: string };

/** GET /api/rally/bootstrap */
export type Bootstrap = {
  me: string; workspace: { name: string }; calendar: CalendarEvent[]; people: Person[]; agents: Agent[]; rooms: Room[]; folders: Folder[]; starred: string[];
  messages: Record<string, Message[]>; files: Record<string, FileRef[]>; approvals: Approval[]; jobs: Job[]; tasks: Task[];
  routines: Routine[]; activity: ActivityRow[]; permissions: Permissions; safety: Safety; alwaysRules: AlwaysRule[];
};

// Server-sent events on GET /api/rally/stream. Every event is an upsert or a patch, so replaying one is harmless.
export type RallyEvent =
  | { type: "message"; data: Message }
  | { type: "agent"; data: Agent }
  | { type: "agent_status"; data: Pick<Agent, "id" | "status" | "now" | "paused"> }
  | { type: "job_progress"; data: Job }
  | { type: "task"; data: Task }
  | { type: "task_removed"; data: { id: string } }
  | { type: "calendar_event"; data: CalendarEvent }
  | { type: "calendar_removed"; data: { id: string } }
  | { type: "typing"; data: { roomId: string; text: string } }
  | { type: "files"; data: { roomId: string; files: FileRef[] } }
  | { type: "approval_requested"; data: Approval }
  | { type: "approval_resolved"; data: Pick<Approval, "id" | "status" | "resolvedBy" | "resolvedAt"> }
  | { type: "always_rules"; data: AlwaysRule[] }
  | { type: "routine"; data: Routine }
  | { type: "activity"; data: ActivityRow }
  | { type: "activity_removed"; data: { id: string } }
  | { type: "permissions"; data: { agentId: string; perms: Record<PermKey, Perm> } }
  | { type: "safety"; data: Safety };
