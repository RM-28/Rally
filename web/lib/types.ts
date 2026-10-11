export type CurvePoint = {
  n: number;
  practice: number | null;
  check: number | null;
  best_ever: number | null;
  best_ever_check: number | null;
  /** set when this round's new record came from an assignment that carried out a human message */
  steered_by?: HumanMessage | null;
};

export type HumanMessage = { name: string; text: string };

export type BotInfo = {
  name: string;
  status: "active" | "fired";
  angle?: string | null;
  hired_round: number;
  fired_round?: number | null;
  history: { round: number; gap: number | null }[];
  latest: {
    id: string;
    round: number;
    gap: number | null;
    change?: string | null;
    note?: string | null;
    status: "ok" | "rejected";
    delta?: number | null;
    error?: string | null;
    per_instance?: Record<string, number | null> | null;
    spread?: number | null;
    check_gap?: number | null;
    parent_id?: string | null;
  } | null;
};

export type Showcase = {
  instance_id: string;
  makespan: number;
  n_jobs: number;
  n_machines: number;
  rows: [number, number, number, number][][]; // rows[machine] = [job, step, start, end][]
  downtime: Record<string, [number, number][]>;
  // only on the "with surprises" calendar
  event?: { busiest_machine: number; window: [number, number]; late_job: number; release: number } | null;
};

export type Message = { _id: string; ts: string; name: string; text: string; bot?: string | null };

export type LeaderRow = { id: string; bot: string; note?: string; practice_gap: number; delta?: number | null; round: number };

export type State = {
  app_name: string;
  run: null | {
    _id: string;
    job: string;
    n_bots: number;
    rounds_planned: number;
    status: string;
    paused?: boolean;
    time_limit?: number;
    repeats?: number;
    showcase_fcfs?: number | null;
    showcase_events_fcfs?: number | null;
    showcase_fcfs_plan?: Showcase | null;
    showcase_events_fcfs_plan?: Showcase | null;
    started_at?: string;
    finished_at?: string | null;
  };
  round?: null | {
    n: number;
    best_practice_gap: number | null;
    check_gap: number | null;
    best_ever_id: string;
    best_ever_practice_gap: number;
    best_ever_check_gap: number | null;
    leaderboard: LeaderRow[];
    tests_run: number;
  };
  curve?: CurvePoint[];
  baselines?: Record<string, { practice: number; check: number }>;
  solver?: { practice?: number; check?: number; secs?: number; workers?: number };
  showcase?: Showcase | null;
  showcase_events?: Showcase | null;
  playbook?: string[];
  bots?: BotInfo[];
  usage?: { calls: number; tokens_in: number; tokens_out: number };
  tests_run?: number;
  messages?: Message[];
  people: string[];
  /** every proposal of the latest finished round, for the leaderboard card */
  round_results?: RoundResult[];
  proposals?: { ok: number; total: number };
};

export type RoundResult = { id: string; bot: string; change?: string | null; practice_gap: number | null; delta?: number | null; status: "ok" | "rejected"; error?: string | null };

export type LiveEvent = {
  _id: string;
  run_id: string | null;
  ts: string;
  type: string;
  bot: string | null;
  data: Record<string, unknown>;
};

export type StrategyDoc = {
  _id: string;
  bot: string;
  round: number;
  code: string | null;
  parent_code: string | null;
  parent_id: string | null;
  note?: string;
  change?: string;
  practice_gap: number | null;
  check_gap: number | null;
  delta?: number | null;
  error?: string | null;
  status: string;
  practice_spread?: number | null;
  per_instance?: Record<string, number | null> | null;
  human_message?: HumanMessage | null;
};

/** GET /api/lineage/{sid}: root first. siblings = other ideas built on that node that did not become the next step. */
export type LineageNode = {
  id: string;
  round: number;
  bot: string;
  change: string;
  note: string;
  practice_gap: number | null;
  check_gap: number | null;
  delta: number | null;
  human_message?: HumanMessage | null;
  siblings: { id: string; round: number; bot: string; change: string; practice_gap: number | null; verdict: "AVOID" | "Kept" | "No gain" | "Round best" | "Sat out" }[];
  more: number;
};

/** GET /api/results: read from data/*.json and the main run, never recomputed. */
export type Results = {
  final: { set: "held_out" | "fresh" | "events"; label: string; detail: string; baseline_gap: number; team_gap: number; shorter_pct: number | null; gap_closed_pct: number | null; gap_closed_vs_fcfs_pct: number | null }[];
  final_eval_ts: string | null;
  splits_commit: string | null;
  strategy_id: string | null;
  time_limit: number;
  repeats: number;
  main_run: { id: string; n_bots: number; rounds: number; calls: number; tokens: number; minutes: number | null; proposals_ok: number; proposals_total: number } | null;
  rounds: { n: number; practice: number | null; check: number | null; set_by: string; human_message?: HumanMessage | null }[];
  head_to_head: { bots: number; rounds: number; at5?: number | null; at10?: number | null; at15?: number | null; check15?: number | null; tokens: number }[];
  team_size: { bots: number; practice_mean: number; lo: number; hi: number; check_mean: number | null; runs: number }[];
  approaches: { family: string; first_tried: string; best: string; fate: string }[];
};

/** POST /api/schedule body: tasks in order within each project, people and projects by name. */
export type ScheduleInput = {
  tasks: { project: string; person: string; hours: number }[];
  downtime: { person: string; start: number; end: number }[];
  release: { project: string; at: number }[];
};
/** POST /api/schedule and GET /api/team-schedule: the latest plan, shared by every viewer. Runs the frozen best strategy, never tunes. */
export type TeamSchedule = {
  ts: string;
  /** hour 0 of the plan: the next working morning, 9:00 */
  start: string;
  hours_per_day: number;
  input: ScheduleInput;
  people: string[];
  projects: string[];
  fcfs: Showcase;
  bot: Showcase;
  hours_saved: number;
  pct_shorter: number;
  /** the strategy did no better than first come, first served, so that plan was kept */
  kept_simple: boolean;
  strategy: { id: string; bot: string };
};
