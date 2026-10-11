import type { Agent, Autonomy } from "@/lib/rally-types";

export const AUTONOMY: Record<Autonomy, { label: string; short: string; desc: string }> = {
  ask: { label: "Ask first", short: "Ask first", desc: "Proposes each action and waits for a person to approve it." },
  limits: { label: "Act within limits", short: "Within limits", desc: "Works on its own inside the permissions you set. Asks for anything outside them." },
  act: { label: "Act & report", short: "Act & report", desc: "Does the work, then posts what it did. Best for internal, reversible tasks." },
};

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export function clock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** "3m ago", "2h ago", "Yesterday", "Oct 8" */
export function ago(iso: string) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 24 * 60 && sameDay(d, new Date())) return `${Math.round(mins / 60)}h ago`;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (sameDay(d, y) || mins < 48 * 60) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Activity log time: clock time today, "Yesterday", or a date. */
export function stamp(iso: string) {
  const d = new Date(iso);
  if (sameDay(d, new Date())) return clock(iso);
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return sameDay(d, y) ? "Yesterday" : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Thread divider: "Today", "Yesterday", or "Thu, Oct 8". */
export function dayLabel(iso: string) {
  const d = new Date(iso);
  if (sameDay(d, new Date())) return "Today";
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return sameDay(d, y) ? "Yesterday" : d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

/** "Tue, Oct 13 · 3:00 PM – 3:45 PM" in the viewer's time zone. */
export function eventWhen(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const t = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${s.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} · ${t(s)} – ${t(e)}`;
}

export const tint = (c: number) => ({ background: `var(--a${c}-bg)`, color: `var(--a${c})` });
export const accent = (c: number) => `var(--a${c})`;

export function dotColor(a: Agent) {
  if (a.paused) return "var(--line-strong)";
  if (a.status === "working") return "var(--live)";
  if (a.status === "waiting") return "var(--warn)";
  return "var(--line-strong)";
}

export const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
