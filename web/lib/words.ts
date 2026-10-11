// Plain-English labels for the board. "Gap" = how much later the plan finishes than the best known plan.

const BASELINE_NAMES: Record<string, string> = {
  fcfs: "First come, first served",
  simple_rule: "Simple rule",
};

/** "baseline:fcfs" -> "First come, first served"; bot names pass through. */
export function who(bot: string | null | undefined): string {
  if (!bot) return "";
  return bot.startsWith("baseline:") ? (BASELINE_NAMES[bot.slice(9)] ?? bot.slice(9)) : bot;
}

/** 12.345 -> "12.3% behind best known": how much later the plan finishes than the best known plan. */
export function behind(gap: number | null | undefined, digits = 1): string {
  if (gap == null) return "–";
  return `${gap.toFixed(digits)}% behind best known`;
}

/** Change vs the version a bot started from, in percentage points. */
export function better(delta: number | null | undefined): string | null {
  if (delta == null) return null;
  if (Math.abs(delta) < 0.005) return "same as its starting point";
  return delta < 0 ? `${(-delta).toFixed(2)} pts better than its start` : `${delta.toFixed(2)} pts worse than its start`;
}
