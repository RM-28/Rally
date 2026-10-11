# Build plan: multiplayer AI bot team (hackathon build)

Hand this file to Claude Code at the repo root. Build the phases in order. Each phase has a "done when" check. Do not start a phase until the previous check passes.

Event: c0mpiled-15 at Penn State, Sunday Oct 11, 2026. Build window 12:00 to 20:00. Team: Matteo (board, deploy, pitch) and Raj (engine).

## 1. What we are building

A mission control where a team of AI bots works on a job in parallel and gets measurably better every round, and where several people can watch the same live session and steer the bots in plain English.

- Product name: not chosen yet. Keep it in one place: `APP_NAME` in `web/lib/config.ts` and `engine/config.py`.
- The platform is general. A job is a plug-in (tasks + scorer + baseline).
- Test 1 (must ship): calendar and schedule optimization, scored on the public job-shop benchmark.
- More tests (only if time): code speed, delivery routes, security hardening.

### What the judges need to see (Track 1A)

1. Multiple agents working in parallel.
2. Rounds of propose, test, learn.
3. Models hosted on Luminal Cloud.
4. A starting baseline.
5. Improvement across rounds.
6. A final score on fresh tests never used during optimization.
7. Judging is on relative improvement and problem difficulty.

Every design choice below serves one of those seven points.

## 2. Tech stack

| Piece | Choice |
|---|---|
| Bot model | Luminal Cloud, `deepseek-ai/DeepSeek-V4.1-Flash` |
| Engine | Python 3.12, asyncio |
| API | FastAPI + uvicorn, server-sent events for the live feed |
| Test runner | AWS Lambda (Python 3.12, 2048 MB, 60 s timeout). Local subprocess runner as fallback |
| Database | MongoDB Atlas free tier (M0), hosted on AWS us-east-1 |
| Board | Next.js (App Router) + TypeScript + Tailwind + Recharts |
| Engine hosting | One small EC2 box (Ubuntu), Caddy in front for HTTPS |
| Board hosting | AWS Amplify. Fallback: static export served by FastAPI on the same box |
| Reference solver | Google OR-Tools CP-SAT (`pip install ortools`) |
| Benchmark | JSPLIB, https://github.com/tamy0612/JSPLIB |

Known limits to design around:

- Luminal default rate limit: 60 requests per minute, 1,000,000 tokens per minute. The model reasons before answering and reasoning tokens are billed as output.
- Atlas M0: 0.5 GB storage, 100 operations per second, 500 connections. Write once per round, not once per test.
- New AWS accounts often have a low Lambda concurrency limit. Use an existing account.

Unconfirmed, check first:

- Luminal's text API base URL and whether it accepts the OpenAI-style chat completions client. All model calls go through one function so only one file changes if it does not.
- Whether Atlas Vector Search works on M0. Memory search is optional and is cut if it does not.

## 3. Repo layout

```
/engine
  config.py            # APP_NAME, env loading, constants
  model.py             # call_model(): the only path to any model
  store.py             # MongoDB access
  bots.py              # prompts for chief of staff, worker, scribe
  loop.py              # the round loop
  api.py               # FastAPI app
  jobs/
    base.py            # Job plug-in interface
    jobshop/
      job.py           # implements Job
      decoder.py       # sequence -> schedule -> score
      instances.py     # JSPLIB loader, splits
      generate.py      # fresh instances + surprise-event variants
      brief.md         # the brief given to bots
      baselines/fcfs.py
      baselines/simple_rule.py
  runner/
    child.py           # runs ONE strategy on ONE instance in a clean process
    local.py           # subprocess runner
    handler.py         # AWS Lambda entry point (calls child.py)
    lambda_client.py   # fan-out via boto3
  scripts/
    baseline.py        # prints baseline gaps
    solver_ref.py      # CP-SAT reference, writes data/reference.json
    final_eval.py      # held-out + fresh run, once
    compare_bots.py    # 1 vs 2 vs 4 vs 8 bots
/web                   # Next.js board
/infra                 # package_lambda.sh, deploy notes
/data
  JSPLIB/              # git clone, gitignored
  splits.json          # committed BEFORE round 1
  generated/           # fresh instances, committed BEFORE round 1
  reference.json       # best-known or solver score per instance
.env.example
```

## 4. Environment variables

```
LUMINAL_API_KEY=
LUMINAL_BASE_URL=            # from the Luminal dashboard
LUMINAL_MODEL=deepseek-ai/DeepSeek-V4.1-Flash
MONGODB_URI=
MONGODB_DB=botteam
AWS_REGION=us-east-1
LAMBDA_FUNCTION_NAME=botteam-runner
RUNNER=local                 # local | lambda
TIME_LIMIT_S=2.0             # seconds a strategy may think per instance
REPEATS=3                    # runs per strategy per instance
N_BOTS=4                     # 4 while building, 8 for the real run
WEB_ORIGIN=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Never commit `.env`. Never put any secret in the Lambda function's environment.

## 5. The job plug-in interface

```python
# engine/jobs/base.py
from typing import Protocol

class Job(Protocol):
    name: str            # "jobshop"
    entrypoint: str      # function name a strategy must define, "solve"

    def brief(self) -> str: ...                       # text handed to bots
    def sets(self) -> dict[str, list[str]]: ...       # quick, practice, check, heldout, fresh, events
    def load(self, instance_id: str) -> dict: ...     # JSON-serialisable instance
    def baselines(self) -> dict[str, str]: ...        # name -> strategy source code
    def score(self, instance: dict, output) -> float: ...   # raises ValueError if invalid. Lower is better
    def reference(self, instance_id: str) -> float: ...     # best-known or solver score
    def showcase(self, instance: dict, output) -> dict: ... # data for the board's calendar view
```

Gap is always `100 * (score - reference) / reference`. A second job only has to implement this interface. Nothing else in the engine may know about scheduling.

## 6. Test 1: the scheduling job

### Strategy contract

A strategy is one Python file, standard library only:

```python
def solve(jobs, n_machines, time_limit, release=None, downtime=None):
    # jobs[j] = list of (machine, duration) in the order job j must run them
    # release[j] = earliest start time of job j (None means all zero)
    # downtime[m] = list of (start, end) windows when machine m is unavailable (None means none)
    # return a list of job ids. Job id j must appear len(jobs[j]) times.
    # The k-th appearance of j means "schedule job j's k-th step next".
```

In the product story a "machine" is a person and a "job" is a project. `downtime` is a person being out. `release` is a rush job arriving late.

### Decoder and scorer

```python
# engine/jobs/jobshop/decoder.py
def makespan(jobs, n_machines, seq, release=None, downtime=None):
    n = len(jobs)
    need = [len(j) for j in jobs]
    if len(seq) != sum(need):
        raise ValueError(f"wrong length: got {len(seq)}, need {sum(need)}")
    nxt = [0] * n
    job_ready = list(release) if release else [0] * n
    mach_ready = [0] * n_machines
    for j in seq:
        j = int(j)
        k = nxt[j]
        if k >= need[j]:
            raise ValueError(f"job {j} appears too many times")
        mc, d = jobs[j][k]
        start = max(job_ready[j], mach_ready[mc])
        if downtime:
            for a, b in sorted(downtime.get(mc, [])):
                if start < b and start + d > a:   # would overlap the window
                    start = b
        job_ready[j] = mach_ready[mc] = start + d
        nxt[j] = k + 1
    return max(job_ready)
```

The scorer is the only judge. A strategy cannot report its own score.

### Instance sets (write to `data/splits.json` and commit before round 1)

- `quick` (sanity check only): ft06, la01
- `practice` (bots learn on these): ta41 to ta45, ta51 to ta55, swv11 to swv15
- `check` (scored every round, never shown to bots, never used to pick winners): ta31, ta32, ta33, swv06, swv07, swv08
- `heldout` (final only): ta46 to ta50, ta56 to ta65, swv16 to swv20
- `fresh` (final only): 10 newly generated instances, Taillard recipe (durations uniform 1 to 99, random machine order per job), 5 at 30x20 and 5 at 50x15, seeds recorded in `splits.json`
- `events` (surprise-event test, final only): 10 instances built from `fresh` by adding one downtime window on the busiest machine and one late-released job, seeds recorded

Reference scores: for JSPLIB use `optimum`, or `bounds.upper` when optimum is null, from `data/JSPLIB/instances.json`. For `fresh` and `events` run CP-SAT for 60 s per instance (CP-SAT must model release times and downtime too).

### Baselines

- `fcfs`: step 1 of every job in job order, then step 2, and so on. This is the headline baseline.
- `simple_rule`: always start the waiting step that can begin earliest, ties broken by shortest duration.

## 7. The runner

One contract for local and Lambda.

Request:
```json
{"job": "jobshop", "strategy_code": "...", "instance_id": "ta41", "time_limit": 2.0, "repeats": 3}
```
Response:
```json
{"instance_id": "ta41", "runs": [{"score": 2301, "secs": 1.6}, {"error": "ValueError: ..."}]}
```

Rules:

- `child.py` loads the strategy source into a fresh module, calls the entrypoint, and prints the raw output as JSON. It runs as `python -I child.py` in a subprocess with a hard timeout of `3 * time_limit + 5` seconds.
- The parent (not the child) calls `Job.score()`. An error, a timeout, or taking longer than `2.5 * time_limit` scores nothing for that run.
- Bot-written code is never `exec`'d or imported inside the engine process or the API process.
- Before running, reject a strategy with an AST check if it imports anything outside this allowlist: `math, random, time, heapq, itertools, collections, functools, bisect, array, operator, copy`. Also reject if the file is over 30 KB or does not define the entrypoint.
- `local.py`: thread pool of subprocesses, pool size = CPU count.
- Lambda: `handler.py` does the same thing as `local.py` for one request. Bundle `data/` instances in the package. The function's IAM role has no permissions beyond writing its own logs. No VPC, no secrets, no environment variables.
- `lambda_client.py`: `boto3` `invoke` from a `ThreadPoolExecutor(max_workers=64)`, one invocation per (strategy, instance). Retry once on a transport error. Never retry on a strategy error.
- `RUNNER=local|lambda` picks the backend. Everything must work with `local` so the demo survives an AWS problem.

## 8. The model client

```python
# engine/model.py
async def call_model(messages, *, role, max_tokens=8000, temperature=0.8) -> str
```

- Uses the OpenAI-style async client pointed at `LUMINAL_BASE_URL` with `LUMINAL_API_KEY` and `LUMINAL_MODEL`.
- Global limiter: at most 50 requests per minute and 8 in flight. Retry with backoff on 429 and 5xx, up to 3 times.
- Records every call to the `usage` collection: role, tokens in, tokens out, seconds. The board shows the running totals.
- `extract_code(text)` returns the last ```python fenced block. If there is none, the call counts as a failed proposal.

## 9. The bots

Roster of names, used in order as bots are hired: Atlas, Bishop, Cleo, Dash, Echo, Fig, Gus, Halo, Indy, Juno, Kit, Lark, Moss, Nova, Otis, Pip.

### Chief of staff (1 call per round)

Input: leaderboard (top 5 strategies with id, bot, one-line note, practice gap, change vs parent), the playbook, the list of bots, and any human messages since last round.

Output, JSON only:
```json
{
  "assignments": [{"bot": "Cleo", "parent": "<strategy_id>", "change": "one small, specific change to try"}],
  "hire_angle": "one sentence: what the new hire should explore",
  "reply_to_humans": "one sentence, or empty"
}
```
Rules in the prompt: one small change per bot, no two bots get the same change, parents come from the top 3 strategies so far, at least one bot tries something not yet in the playbook, human messages take priority.

### Worker (N calls per round, in parallel)

Input: the job brief, the full parent strategy source, its assignment, the playbook, and on a retry the error message.

Output: the complete new strategy file in one ```python block, then one line starting `NOTE:` saying what changed in under 20 words.

Rules in the prompt: make only the assigned change, keep the file self-contained, check `time.time()` in every loop and stop at 80% of `time_limit`, never catch an exception and silently return the starting schedule.

A proposal that fails the AST check or the `quick` set gets one retry with the error. A second failure means the bot sits out the round.

### Scribe (1 call per round)

Input: for each strategy this round, its NOTE and its gap change vs its parent.

Output: the updated playbook, at most 12 lines, each starting `DO:` or `AVOID:`, most useful first.

## 10. One round

1. Chief of staff assigns changes.
2. Workers propose in parallel.
3. Reject broken proposals (AST check, then `quick` set). One retry.
4. Run every surviving strategy on `practice`, `REPEATS` times per instance. Score = mean gap.
5. Run the round's best strategy on `check`. Store it. Do not show it to any bot and do not use it for ranking.
6. Rank by practice gap. Team best = lowest mean, ties broken by lower spread.
7. Fire the bot ranked last this round, unless it holds the best-ever strategy. Hire the next name on the roster with `hire_angle`.
8. Scribe updates the playbook.
9. Store the best strategy's actual schedule for one showcase instance so the board can draw the calendar.
10. Write the round document and emit events.

Round 0 is the baselines only, no model calls.

Hard rules:

- `heldout`, `fresh` and `events` are touched only by `scripts/final_eval.py`. That script records a timestamp and the git commit of `data/splits.json`, and refuses to run a second time without `--force`.
- Nothing is tuned after `final_eval.py` runs.
- Every reported number is a mean over `REPEATS` runs. Store the individual runs too.

## 11. Database

Collections (database `botteam`):

- `runs`: `{_id, job, n_bots, started_at, status, splits_commit}`
- `bots`: `{_id, run_id, name, status: "active"|"fired", hired_round, fired_round, angle}`
- `strategies`: `{_id, run_id, round, bot, parent_id, code, note, status: "ok"|"rejected", practice_gap, practice_runs, check_gap, error}`
- `rounds`: `{_id, run_id, n, best_strategy_id, best_practice_gap, check_gap, leaderboard, showcase, started_at, finished_at}`
- `lessons`: `{_id, run_id, round, lines: [...]}`
- `events`: `{_id, run_id, ts, type, bot, data}`
- `messages`: `{_id, run_id, ts, name, text, bot}`
- `usage`: `{_id, run_id, ts, role, tokens_in, tokens_out, secs}`
- `presence`: `{_id: name, run_id, last_seen}`

Event types: `round_started, assignment, proposal, rejected, scored, fired, hired, lesson, human_message, round_finished, final_result`.

Indexes: `strategies.run_id + round`, `strategies.parent_id`, `events.run_id + _id`.

The family tree is `$graphLookup` on `strategies` from a strategy `_id` up through `parent_id`.

Write budget: one batch insert of strategies and one round document per round. Events are small and at most a few per bot per round.

## 12. API

- `GET /api/state`: current run, bots, latest round, the curve (practice and check gap per round), baseline and solver reference lines, playbook, usage totals, people present.
- `GET /api/stream`: server-sent events. Watches a MongoDB change stream on `events`. If change streams fail, fall back to polling `events` by `_id` every second.
- `GET /api/strategies/{id}`: code, note, scores, parent id.
- `GET /api/lineage/{id}`: the chain of ancestors.
- `POST /api/messages`: `{name, text, bot?}`. Stored, emitted as an event, read by the chief of staff next round.
- `POST /api/presence`: `{name}` heartbeat every 10 s. Present means seen in the last 30 s.
- `POST /api/run/start`: `{job, n_bots, rounds}`. `POST /api/run/pause`, `POST /api/run/resume`.

CORS allows `WEB_ORIGIN` only. Run control endpoints require a shared `ADMIN_TOKEN` header so the audience cannot stop the run.

## 13. The board

One page. No login. On first visit ask for a name and keep it in localStorage.

- Header: app name, round number, people present, counters (Luminal calls, tokens, tests run).
- Bot grid: one tile per bot with name, status (thinking, testing, scored, sat out, fired), its assigned change, its latest gap, and a small trend line. Clicking a tile shows the code and what changed from the parent. A fired bot's tile greys out and the new hire slides in.
- Score chart: gap per round for practice and check, with flat reference lines for the first come, first served baseline and the solver.
- Calendar view: for the showcase instance, one row per person, bars for tasks coloured by project, redrawn each round so the finish line visibly moves left.
- Playbook: the current lessons.
- Message box: "Tell the bots something", with an optional bot picker. Messages appear in a shared feed with the sender's name.
- QR code for the board URL.

Look: dark navy background, electric blue accent, IBM Plex Sans for text and IBM Plex Mono for numbers and code (the Synergenica house look).

Live updates come from `EventSource` on `/api/stream`. On reconnect, refetch `/api/state`.

## 14. Phases

**Phase 0, scaffold (12:00 to 12:30).** Repo layout, `.env.example`, `scripts/ping.py` that makes one Luminal call and one MongoDB write. Next.js app boots.
Done when: `python -m engine.scripts.ping` prints a model reply and a MongoDB document id.

**Phase 1, the job and the baseline (to 13:30).** Job interface, scheduling job, decoder, baselines, splits, generator, CP-SAT reference running in the background.
Done when: `python -m engine.scripts.baseline` prints the practice and check gaps for both baselines, and `data/splits.json` plus `data/generated/` are committed.

**Phase 2, the loop, local (to 15:00).** Local runner, model client, three bot roles, round loop with 4 bots, hire and fire, playbook, all writes to MongoDB.
Done when: 5 rounds run end to end unattended and the best practice gap is below the first come, first served baseline.

**Phase 3, live board (in parallel, to 15:00).** API, event stream, board reading real data.
Done when: starting a run from the API makes tiles, chart and playbook update live in two browsers at once.

**Phase 4, Lambda and scale (to 16:00).** Package and deploy the runner, switch `RUNNER=lambda`, go to 8 bots.
Done when: a full round's tests finish in under 30 seconds on Lambda with the same scores as local, within run-to-run noise.

**Phase 5, people (to 16:30).** Messages, presence, chief of staff reads messages.
Done when: a message typed on a phone changes at least one bot's assignment next round and shows on every screen.

**Phase 6, surprise events (to 17:30).** `events` set with downtime and late release, CP-SAT reference for it, a board toggle to show it.
Done when: `final_eval.py --dry-run` on two `events` instances returns valid scores for the baseline and the current best.

**Phase 7, proof (to 18:30).** `compare_bots.py` (1, 2, 4, 8 bots, same number of rounds, 2 seeds each), then `final_eval.py` once.
Done when: one table exists with baseline, final and reference gaps for `heldout`, `fresh` and `events`, each a mean of 3 runs.

**Phase 8, deploy.** Engine and API on EC2 behind Caddy with HTTPS, board on Amplify.
Done when: the board works from a phone on mobile data.

Deploy notes:
- The board on Amplify is served over HTTPS, so the API must be HTTPS too or the browser will block it. Use Caddy on the EC2 box with a hostname of the form `<ip-with-dashes>.sslip.io` for an automatic certificate.
- Fallback if Amplify or HTTPS fights back: `next build` with static export and let FastAPI serve the files from the same origin.
- Last resort: run everything on a laptop. The demo must not depend on the deploy.

## 15. If time runs short, cut in this order

1. Memory search with embeddings
2. Family tree view
3. Bot-count comparison
4. Surprise events
5. Lambda (stay on the local runner and drop the AWS prize)

Never cut: the baseline, the check-set line, the held-out and fresh final run, the repeat averaging.

## 16. More tests, only after Phase 7

Each is a new folder under `engine/jobs/` implementing the Job interface. Nothing else changes.

1. Code speed: tasks are slow functions with tests. Score is run time, invalid if any test fails.
2. Delivery routes: tasks are stops with distances. Score is total route length.
3. Security hardening: tasks are small apps with planted holes. Score is attacks still working, invalid if a feature test fails.

A second test goes in the demo only if it has its own baseline and curve by 18:00.

## 17. What we already know from a trial run

A trial this morning (4 bots, 3 rounds, a small stand-in model, small instances, 1 second per instance) gave these mean gaps on held-out instances: first come, first served 50.8%, round 1 best 14.6%, round 2 best 7.2%, round 3 best 7.4%, CP-SAT with 5 seconds 6.5%.

What that means for this build:

- The method works and the gain held on unseen instances.
- Almost all of the gain came in the first two rounds, and by round 2 two bots had independently reached the textbook method (tabu search on the critical path). That is why this plan uses the largest instances, one small change per bot per round, and a surprise-event test that has no textbook answer.
- Scores moved by about half a point between identical runs. That is why everything is averaged.
- It was not run on Luminal's model. Rerun the baseline and two rounds on Luminal before trusting any of it.

Starter code from that trial (scorer, baselines, bot brief, every strategy the bots wrote) is in `bot-team-test.zip`.
