export type CurvePoint = {
  n: number;
  practice: number | null;
  check: number | null;
  best_ever: number | null;
  best_ever_check: number | null;
};

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
  } | null;
};

export type Showcase = {
  instance_id: string;
  makespan: number;
  n_jobs: number;
  n_machines: number;
  rows: [number, number, number, number][][]; // rows[machine] = [job, step, start, end][]
  downtime: Record<string, [number, number][]>;
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
  solver?: { practice?: number; check?: number; secs?: number };
  showcase?: Showcase | null;
  playbook?: string[];
  bots?: BotInfo[];
  usage?: { calls: number; tokens_in: number; tokens_out: number };
  tests_run?: number;
  messages?: Message[];
  people: string[];
};

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
};
