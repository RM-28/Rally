// Shared helpers for the board screens: live status, bot colors, labels.
import type { BotInfo, LiveEvent } from "@/lib/types";
import { behind, who } from "@/lib/words";

export type LiveStatus = "waiting" | "thinking" | "retrying" | "testing" | "scored" | "sat out" | "fired";

export type LiveBot = { status: LiveStatus; change?: string; gap?: number | null; delta?: number | null; error?: string };

export const STATUS_LABEL: Record<LiveStatus, string> = {
  waiting: "Waiting",
  thinking: "Writing code",
  retrying: "Fixing a bug",
  testing: "Testing",
  scored: "Done",
  "sat out": "Sat out",
  fired: "Fired",
};

/** [background, text] token pair per status. */
export const STATUS_TONE: Record<LiveStatus, [string, string]> = {
  waiting: ["var(--hover)", "var(--ink-3)"],
  thinking: ["var(--a1-bg)", "var(--a1)"],
  retrying: ["var(--warn-bg)", "var(--warn-fg)"],
  testing: ["var(--a5-bg)", "var(--a5)"],
  scored: ["var(--ok-bg)", "var(--ok)"],
  "sat out": ["var(--bad-bg)", "var(--danger)"],
  fired: ["var(--hover)", "var(--ink-3)"],
};

/** A bot's status from the live event stream, falling back to its last stored result. */
export function statusOf(b: BotInfo, l?: LiveBot): LiveStatus {
  if (b.status === "fired") return "fired";
  return l?.status ?? (b.latest ? (b.latest.status === "ok" ? "scored" : "sat out") : "waiting");
}

/** Hire slot 1–8 per bot: a new hire takes the lowest slot no active bot holds, so colors stay put. */
export function botSlots(bots: BotInfo[]): Record<string, number> {
  const out: Record<string, number> = {};
  const held: { name: string; slot: number; until: number }[] = [];
  for (const b of [...bots].sort((x, y) => x.hired_round - y.hired_round)) {
    const taken = new Set(held.filter((h) => h.until > b.hired_round).map((h) => h.slot));
    const slot = [1, 2, 3, 4, 5, 6, 7, 8].find((s) => !taken.has(s)) ?? ((held.length % 8) + 1);
    held.push({ name: b.name, slot, until: b.fired_round ?? Infinity });
    out[b.name] = slot;
  }
  return out;
}

export function tint(slot: number | undefined): { background: string; color: string } {
  return slot ? { background: `var(--a${slot}-bg)`, color: `var(--a${slot})` } : { background: "var(--hover)", color: "var(--ink-2)" };
}

export const initial = (bot: string) => (bot.startsWith("baseline:") ? "·" : bot[0] ?? "?");

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** Project 0 -> "A"; past Z, plain numbers. */
export const projectLabel = (j: number) => (j < 26 ? LETTERS[j] : String(j + 1));
export const projectFill = (j: number) => `var(--p${j % 10})`;

/** Names for the people on the showcase calendar (one per machine). */
const PEOPLE = ["Ana", "Ben", "Cai", "Dee", "Eli", "Fay", "Ivy", "Jon", "Kim", "Leo", "Mia", "Ned", "Ola", "Pat", "Quy", "Ray", "Sue", "Tom", "Uma", "Val", "Wes", "Xia", "Yan", "Zoe"];
export const personName = (m: number) => PEOPLE[m] ?? `P${m + 1}`;

export function fmtK(n: number | null | undefined): string {
  if (n == null) return "0";
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}

export const pct = (v: number | null | undefined, d = 2) => (v == null ? "–" : `${v.toFixed(d)}%`);

/** "0.16 pts better" / "0.10 pts worse" for tiles. */
export function deltaWords(d: number | null | undefined): string {
  if (d == null) return "";
  if (Math.abs(d) < 0.005) return "no change";
  return d < 0 ? `${(-d).toFixed(2)} pts better` : `${d.toFixed(2)} pts worse`;
}
/** "-0.16" / "+0.10" for tables. */
export const deltaSigned = (d: number | null | undefined) => (d == null ? "–" : `${d > 0 ? "+" : ""}${d.toFixed(2)}`);
export const deltaColor = (d: number | null | undefined) => (d == null || Math.abs(d) < 0.005 ? "var(--ink-3)" : d < 0 ? "var(--ok)" : "var(--danger)");

/** One line for the Live feed. */
export function describe(e: LiveEvent): string | null {
  const d = e.data as Record<string, unknown>;
  const g = (v: unknown) => (typeof v === "number" ? behind(v, 2) : "–");
  switch (e.type) {
    case "round_started":
      return `Round ${d.n} started`;
    case "round_finished":
      return d.error ? `Run stopped: ${d.error}` : `Round ${d.n} done. Team best: ${g(d.best_ever_practice_gap)}`;
    case "scored":
      return `${who(e.bot)}: ${g(d.practice_gap)}`;
    case "fired":
      return `${e.bot} was fired (${d.reason})`;
    case "hired":
      return `${e.bot} joined the team${d.angle ? `: ${d.angle}` : ""}`;
    case "rejected":
      return d.final ? `${e.bot} sat out: their code failed the tests twice` : `${e.bot} is fixing a bug in their code`;
    case "lesson":
      return "The team wrote down what it learned";
    case "human_message":
      return d.name === "Chief of staff" ? "The chief of staff replied" : `${d.name} messaged ${e.bot ?? "the whole team"}`;
    case "paused":
      return "Run paused";
    case "resumed":
      return "Run resumed";
    case "team_scheduled":
      return `Someone planned a team: ${d.hours_saved} h sooner than first come, first served`;
    case "final_result":
      return "Final exam result is in";
    default:
      return null;
  }
}

export const IDEAS = ["Focus on the busiest person", "Try something bold this round", "Keep what works, make small tweaks", "Plan around people being out"];
