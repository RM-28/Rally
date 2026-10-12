# Bot Team

A team of AI bots that works on a hard optimization problem in parallel, gets measurably better every round, and can be steered live by the people watching.

Built at c0mpiled-15 (Penn State, Oct 11 2026) for Track 1A. Every bot runs on **DeepSeek-V4.1-Flash hosted on Luminal Cloud**.

## How the scheduling works

**The problem.** A team has several **people** and several **projects**. Each project is a fixed sequence of **tasks**, and each task needs one specific person for a set number of hours. A person can work on one task at a time, and a project's tasks must happen in order. The goal is to finish everything as early as possible (the *makespan*). This is the classic **job-shop scheduling** problem: in the benchmark literature people are called *machines* and projects are called *jobs*.

**A tiny example.** Three people (Ana, Ben, Cai) and three projects:

| Project | Task 1 | Task 2 | Task 3 |
|---|---|---|---|
| A | Ben 5h | Cai 1h | Ana 3h |
| B | Ana 1h | Cai 3h | Ben 1h |
| C | Ana 1h | Cai 4h | Ben 5h |

The only real decision is **the order in which each person works through their tasks**. First come, first served (everyone handles tasks in the order the projects are listed) finishes at **hour 18**. A better order finishes at **hour 11**, with the same work and the same people:

```
First come, first served: done at hour 18     Better order: done at hour 11
(one character = one hour, . = idle)

hour 0  3  6  9  12 15 18                     hour 0  3  6  9
Ana  BC....AAA.........                       Ana  CB....AAA..
Ben  AAAAA....B...CCCCC                       Ben  AAAAACCCCCB
Cai  .....ABBBCCCC.....                       Cai  .CCCCABBB..
```

The difference: Cai starts project C at hour 1 instead of sitting idle until A arrives at hour 5. That lets Ben start C's final 5 hours at hour 5 instead of hour 13. With 3 people and 3 projects you can check every order by hand. With **20 people and 50 projects** (our benchmark sizes) the number of possible orders is astronomically large: the problem is NP-hard, and no known method finds the best one quickly.

**What a bot writes.** A strategy is a Python function `solve(jobs, n_machines, time_limit, release, downtime)` that returns a **priority list of project ids**: the *k*-th time project *j* appears means "schedule project *j*'s *k*-th task next". A fixed **decoder** (`engine/jobs/jobshop/decoder.py`) turns that list into a calendar: each task starts as soon as both its person and its project's previous task are free (and outside any downtime window). The decoder's finish time is the score. A strategy can never report its own score.

**How good is good?** Each benchmark instance has a **reference schedule**: the best known in the research literature, or for our freshly generated instances a 60-second run of Google's CP-SAT solver. The **gap** is how much later a strategy finishes than the reference: a 10% gap means the calendar ends 10% later than the reference does.

**What the bots discovered.** Starting from simple dispatch rules, the team worked its way up the classic toolbox over the rounds: trying several priority rules and keeping the best, then hill-climbing by swapping tasks on the **critical path** (the chain of back-to-back tasks that sets the finish time), then **tabu search** (keep swapping, even through worse schedules, while remembering recent moves so it doesn't undo them), and finally tuning the tabu memory. That is the textbook route to a strong job-shop solver, found and tuned by the bots in 2-second strategies.

**Surprise events.** The `events` test adds a person being out for a window of time (`downtime`) and a rush project that can't start until later (`release`). No textbook algorithm targets this exact variant, and the bots never trained on it.

## The dataset

**JSPLIB** ([github.com/tamy0612/JSPLIB](https://github.com/tamy0612/JSPLIB)) collects the classic benchmark problems researchers have used to compare scheduling algorithms since the 1960s. Each **instance** is one made-up company: a number of people (machines), a number of projects (jobs), and every project's tasks. For each instance the collection records the **best schedule anyone has found** (its finish time) and whether it is proven optimal. It contains no real company data: the instances are designed to be hard so algorithms can be compared on equal terms.

What an instance looks like: the start of `ft06` (Fisher & Thompson, 1963), 6 projects × 6 people:

```
6 6                                  <- 6 projects, 6 people
2  1  0  3  1  6  3  7  5  3  4  6   <- project 1: person 2 for 1h, then person 0 for 3h, person 1 for 6h, ...
1  8  2  5  4 10  5 10  0 10  3  4   <- project 2: person 1 for 8h, then person 2 for 5h, ...
...
```

Its best possible finish time is 55 hours (proven).

| Family | Source | Size (projects × people) | Used for |
|---|---|---|---|
| ft06, la01 | Fisher & Thompson (1963), Lawrence (1984) | 6×6, 10×5 | quick check that a bot's code runs and is valid |
| **Taillard** ta31–ta65 | Taillard (1993) | 30×15, 30×20, 50×15, 50×20 | the standard hard benchmark; several still have no proven optimum |
| **SWV** swv06–swv20 | Storer, Wu & Vaccari (1992) | 20×15, 50×10 | built to be difficult; some are among the hardest known |
| **fresh01–10** | generated by us with Taillard's recipe (task lengths 1–99 h, random person order), seeds in `data/splits.json` | 30×20, 50×15 | cannot be in any model's training data |
| **event01–10** | the fresh instances plus one person out for a window and one project that starts late | same | a variant no textbook method targets |

**Splits** (committed to git before round 1, in [`data/splits.json`](data/splits.json)):

| Split | Instances | Who sees it |
|---|---|---|
| quick | ft06, la01 | sanity check for every proposal |
| practice | ta41–45, ta51–55, swv11–15 (15) | the bots learn from these; ranks strategies every round |
| check | ta31–33, swv06–08 (6) | scored every round, never shown to the bots, never used to pick winners |
| held-out | ta46–50, ta56–65, swv16–20 (20) | final evaluation only |
| fresh | fresh01–10 | final evaluation only |
| events | event01–10 | final evaluation only |

**References and gap.** For JSPLIB instances the reference is the published optimum, or the best known upper bound when no optimum is proven. For generated instances it is a 60-second Google OR-Tools CP-SAT solve ([`data/reference.json`](data/reference.json)). Gap = how much later a schedule finishes than the reference: ta41's best known finish is 2,018 hours, so a schedule finishing at 2,220 hours has a 10% gap. A set's score is the average gap over its instances.

## Results

The job: **job-shop scheduling** (people × projects × ordered tasks; minimise the finish time). It is NP-hard, and we used the largest standard benchmark instances. Each strategy gets **2 seconds per instance on 1 CPU thread**.

### Final score on tests never used during optimization

The best strategy from the main run (8 bots, 10 rounds), run once by `engine/scripts/final_eval.py`, 3 runs per instance. Gap = how much later the schedule finishes than the reference schedule.

| Test set (never seen by the bots) | Starting baseline (best simple rule) | Bot team | Schedules shorter | Share of the gap closed |
|---|---|---|---|---|
| **Held-out benchmarks** (20 instances, vs best known) | 24.0% | **8.9%** | **12.1%** | **63%** |
| **Fresh instances** (10, generated today, vs 60 s CP-SAT) | 16.9% | **3.0%** | **11.7%** | **82%** |
| **Surprise events** (10, a person out + a rush project, vs 60 s CP-SAT) | 22.5% | **6.0%** | **13.1%** | **73%** |

*Schedules shorter* is the relative improvement in the problem's own objective (finish time) against the baseline the bots started from. *Share of the gap closed* shows how hard that was: near the optimum every extra percent is much harder to find than the first ones. Against first-come-first-served the share closed is 76% / 91% / 86%, but we lead with the stronger baseline.

Recorded in [`data/final_eval.json`](data/final_eval.json) (timestamp, splits commit, every individual run). The splits and fresh/event instances were committed before round 1, and the script refuses to run twice.

### Improvement across rounds (main run, 8 bots)

| Round | Team best, practice set | Unseen check set | Set by |
|---|---|---|---|
| 0 | 26.40% | 32.1% | baseline (best simple rule) |
| 1 | 20.84% | 26.1% | Atlas: multi-start dispatch rules |
| 2 | 20.45% | 26.0% | Gus: adjacent-swap hill climbing |
| 3 | 18.39% | 23.7% | Juno: critical-block swaps |
| **4** | **16.32%** | **20.0%** | **Atlas: tabu search, after a human steering message** |
| 5 | 14.65% | 16.7% | Atlas: adaptive tabu tenure |
| 6 | 14.02% | 15.8% | Atlas: randomized tenure |
| 7 | 13.96% | 15.8% | Echo |
| 8 | **13.86%** | 16.0% | Atlas: aspiration criterion (final) |
| 9–10 | no further gain | ~16.0% | |

The check set is scored every round but never shown to the bots and never used to pick winners, so the second column is an honest generalisation signal. For reference, Google OR-Tools CP-SAT with the same 2 seconds (8 threads) scores 23.3% on practice and 19.3% on check.

Main run cost: 102 Luminal calls, ~860k tokens, 26 minutes. 80 of 80 bot proposals passed the safety and validity checks.

### The improvement loop in action (main run)

**Meaningfully different approaches.** The chief of staff must give every bot a *different* change, and at least one idea that is not yet in the playbook. Over 10 rounds the 80 proposals covered:

| Approach family | First tried | Best result | Fate |
|---|---|---|---|
| Single priority rules (SPT, LPT, most work remaining) | round 1 | 78–598% | disaster, recorded as AVOID |
| Multi-start over several priority rules | round 1 (Atlas) | 20.84% | kept as the construction step |
| Critical-path swap local search | round 1 (Halo) | 22.25% | kept |
| Hill climbing, iterated local search with kicks | rounds 1–3 | 18.97% | kept, later superseded |
| Giffler–Thompson active-schedule builders | rounds 2–3 | no gain | AVOID |
| Critical-block (N5) swaps, insertion moves | rounds 2–3 (Juno) | 18.39% | kept |
| Simulated annealing | rounds 3–4 (Bishop) | worse than parent | AVOID |
| **Tabu search over critical-block swaps** | **round 4 (Atlas, after a human message)** | **16.32%** | **became the backbone** |
| Tabu tuning: adaptive tenure, random tenure, aspiration | rounds 5–8 (Atlas) | **13.86%** | **final strategy** |
| Restarts and double-bridge kicks on stall | rounds 5–8 | 13.88% | close second |
| Path relinking, LNS destroy/repair, beam-search seeding | rounds 6–10 | 13.93% | small or no gains |
| Late acceptance, learned rule weights | rounds 9–10 | worse than parent | AVOID |

**Feedback guiding later rounds.**
- Every proposal is scored against its parent, and the scribe turns the measured deltas into the playbook. After round 1 it read *"AVOID: SPT (shortest duration) dispatch (+515.01)"*; no bot used a single priority rule again.
- Parents are always chosen from the current top 3, so wins compound. After tabu search set the record in round 4, 6 of 8 bots in round 6 built on Atlas's tabu strategy.
- Losers leave the team: the last-ranked bot is fired each round (10 over the run) and replaced by a new bot with a fresh angle from the chief.
- Humans are part of the loop: a viewer's message after round 3 ("try a proper tabu search…") became Atlas's round-4 assignment, which set the record.
- The playbook after round 10 has 12 measured lessons, for example *"DO: tabu over critical-block boundary swaps, random 5–15 tenure per accepted swap (−2.07, −1.67)"* and *"AVOID: acceptance rules — decaying temperature/geometric cooling (+0.38, +0.60)…"*.

### Do parallel agents find better solutions faster? (head-to-head)

Same 15-minute wall-clock budget, no human steering, run one after the other on the same machine so they never share CPU. Only rounds finished inside the budget count (`engine/scripts/head_to_head.py`, data in [`data/head_to_head.json`](data/head_to_head.json)).

| Team | Rounds in 15 min | Team best @ 5 min | @ 10 min | @ 15 min | Unseen check set @ 15 min | Luminal tokens |
|---|---|---|---|---|---|---|
| 2 bots | 10 | **21.27%** | 18.85% | 18.83% | 23.30% | 278k |
| 8 bots | 2 | 26.40% (first round not done yet) | **16.91%** | **16.91%** | **20.43%** | 304k |

- The 8-bot team's **first round alone** (16.91%, about 6 minutes) beat everything the 2-bot team found in **10 rounds and 15 minutes** (18.83%), and the gap held on the unseen check set (20.4% vs 23.3%).
- Breadth beats depth here: 8 different ideas per round finds a good direction sooner than 2 ideas refined over many rounds.
- It did not cost more model budget: both runs used a similar number of tokens (278k vs 304k), because the 2-bot team spent its tokens on more rounds.
- The trade-off: a wider round takes longer (about 6 minutes vs about 1.5), so the small team leads for the first few minutes.

This is one run per team size, so treat it as a head-to-head rather than a statistical result. The 3-round comparison below shows the run-to-run noise.

### Does the team size matter?

1, 2, 4 and 8 bots, 3 rounds each, 2 seeds each (best practice gap per run):

| Bots | Practice mean | Range across seeds | Check mean |
|---|---|---|---|
| 1 | 21.71% | 17.02 – 26.40 | 25.43% |
| 2 | 19.51% | 18.65 – 20.37 | 25.81% |
| 4 | 19.63% | 16.27 – 22.99 | 24.85% |
| 8 | 18.94% | 17.37 – 20.51 | 23.99% |

More bots: slightly better on average and more consistent. With 2 seeds and 3 rounds the differences between 2, 4 and 8 are within the noise; the clearest effect is that one bot is hit-or-miss. Data: [`data/compare_bots.json`](data/compare_bots.json).

### Why this problem is hard

- Job-shop scheduling is NP-hard; exact solvers struggle at these sizes.
- Practice instances are the largest Taillard sets (ta41–45 at 30 jobs × 20 machines, ta51–55 at 50 × 15) plus SWV11–15, several without a proven optimum. The held-out set mixes in some easier solved instances (swv16–20, ta56+).
- Hard limit of 2 seconds per instance; over 2.5× the limit scores nothing.
- **Fresh** instances were generated today, so they cannot be memorised. **Events** add downtime and a late-released job, a case no textbook algorithm targets directly.

Honest caveat: the bots converged on tabu search over critical-block swaps, the textbook method for this problem. They found and tuned it themselves over five rounds (adaptive tenure, aspiration), and it transferred to the events set they never trained on.

## How it works

Each round:

1. **Chief of staff** (1 model call) reads the leaderboard, the playbook and any human messages, and gives every bot **one small, specific change** to try on one of the top 3 strategies.
2. **Workers** (N calls in parallel) each write a complete new strategy file (Python, standard library only).
3. Every proposal is checked: an AST allowlist of imports, then a quick sanity set. One retry with the error message.
4. Survivors run on the 15 **practice** instances, 3 times each, in isolated subprocesses. The parent process scores them; a strategy can never report its own score.
5. The round's best also runs on the **check** set (scored, never shown to bots).
6. The last-ranked bot is fired (unless it holds the record) and a new one is hired with an angle from the chief.
7. **Scribe** (1 call) updates the playbook: at most 12 `DO:` / `AVOID:` lines.

Humans can message the team from the board. The chief reads messages at the start of the next round and replies in the shared feed. In the main run a viewer asked for tabu search; the chief gave it to Atlas, whose next strategy set the record it kept to the end.

Bot-written code is never imported into the engine or API process: it runs under `python -I` in a subprocess with a hard timeout, after an import allowlist check.

## Run it

```bash
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt     # (bin/ on macOS/Linux)
git clone --depth 1 https://github.com/tamy0612/JSPLIB data/JSPLIB
cp .env.example .env      # LUMINAL_API_KEY, LUMINAL_BASE_URL, MONGODB_URI, ADMIN_TOKEN

python -m engine.scripts.ping                        # one Luminal call + one MongoDB write
python -m engine.scripts.baseline                    # baseline gaps on quick/practice/check
python -m engine.loop --rounds 10 --bots 8           # a run from the command line

uvicorn engine.api:app --port 8000                   # API + live event stream
cd web && npm install && npm run dev                 # board on http://localhost:3000
```

Open `http://localhost:3000/?admin=<ADMIN_TOKEN>` for the start / pause / stop buttons; plain `http://localhost:3000` for viewers.

**Your team's calendar.** The board's main calendar is a real one: your own people and projects on working days (9:00–17:00, weekdays), starting the next working morning. Edit the team (plus optional time off and late starts) and the bot team's frozen best strategy schedules it in the same sandbox (API: `POST /api/schedule`), next to first come, first served. Every schedule is saved in MongoDB and pushed to every viewer by the change stream, so all screens show the same calendar. It never tunes anything, so the final results stay valid. On a 600-task team (20 people, 30 projects) it finishes 20% sooner, in under 4 seconds.

Other scripts:

| Command | What it does |
|---|---|
| `python -m engine.scripts.compare_bots --rounds 3 --seeds 2` | 1 / 2 / 4 / 8 bot comparison (`--summarize` rebuilds the table from MongoDB) |
| `python -m engine.scripts.final_eval --strategy <id>` | the one-time held-out / fresh / events evaluation (`--dry-run` for a check) |
| `python -m engine.scripts.solver_ref` | CP-SAT reference scores for generated instances |
| `python -m engine.jobs.jobshop.generate` | fresh + event instances and `data/splits.json` |

## Running on AWS Lambda

`RUNNER=lambda` sends every (strategy, instance) test to the `botteam-runner` function instead of local processes. `infra/template.yaml` (AWS SAM) defines it: Python 3.12, 2048 MB, 60 s, a role with only CloudWatch Logs, 14-day log retention, and a `botteam-runner-invoke` policy (`lambda:InvokeFunction` on this function only) to attach to whatever calls it.

```bash
bash infra/package_lambda.sh                                  # fills infra/build/pkg
sam deploy -t infra/template.yaml --stack-name botteam-runner \
  --capabilities CAPABILITY_NAMED_IAM --resolve-s3 --region us-east-1
aws lambda get-account-settings --query AccountLimit.ConcurrentExecutions   # set LAMBDA_MAX_CONCURRENCY to this or less
```

Measured on 2026-10-12 in us-east-1 (raw numbers in `data/lambda_vs_local.json`):

| | local | Lambda |
|---|---|---|
| Baseline, all sets (`engine.scripts.baseline`) | 1.1 s | 2.0 s, 46 invocations, 0 errors |
| Baseline scores | | identical to local on every instance |
| One 8-bot round (`engine.loop --rounds 1 --bots 8`) | 131.9 s | 120.4 s |
| Round: tests run / proposals scored | 524 / 8 of 8 | 522 / 8 of 8 |
| Round: Lambda invocations, errors, throttles | — | 145, 0, 0 |
| Round: peak concurrency | — | 10 (the account limit) |

A round's wall time is mostly LLM calls, so Lambda only trims it here; the gain grows with more bots, repeats or a higher concurrency limit. New accounts are capped at 10 concurrent executions: with the old 64-in-flight client, 11 of 46 baseline calls were throttled, so the client now keeps at most `LAMBDA_MAX_CONCURRENCY` (default 10) in flight. All of the above (227 invocations, about 247 GB-seconds) costs about $0.004 at list price, inside the monthly free tier. Using an `aws login` session locally needs `pip install "botocore[crt]"`.

## Layout

```
engine/
  config.py, model.py (the only path to the model), store.py (MongoDB)
  bots.py           prompts for chief of staff, worker, scribe
  loop.py           the round loop
  api.py            FastAPI: state, server-sent events, messages, presence, run control
  jobs/             plug-in interface; jobshop/ implements it (decoder, baselines, brief)
  runner/           sandboxed child process, local pool, AWS Lambda handler + client
  scripts/          ping, baseline, solver_ref, compare_bots, final_eval
web/                Next.js board (bot tiles, score chart, calendar, playbook, messages)
infra/              Lambda packaging and deploy notes
data/               splits, generated instances, references, results
```

A new problem is a new folder under `engine/jobs/` implementing the `Job` interface (`brief`, `sets`, `load`, `baselines`, `score`, `reference`, `showcase`). Nothing else in the engine knows about scheduling.

## How MongoDB Atlas powers it

MongoDB Atlas is the team's shared memory and the board's live wire. Every bot, every strategy, every score and every human message lives there, so any number of boards (laptops, phones, the deployed server) watch and steer the same run.

**Why a document database fits.** Each strategy a bot writes is one self-contained document: its code, the change it was assigned, its note, its parent, its scores and every individual test run. Strategies of different shapes and sizes, nested run results and evolving fields need no schema migrations mid-hackathon.

```json
{
  "_id": "run-bc1e8aff-r8-Atlas",
  "run_id": "run-bc1e8aff", "round": 8, "bot": "Atlas",
  "parent_id": "run-bc1e8aff-r6-Atlas",
  "change": "Add an aspiration criterion to the tabu loop: ...",
  "note": "Aspiration now explicitly overrides tabu on new best-ever swaps ...",
  "code": "def solve(jobs, n_machines, time_limit, release=None, downtime=None): ...",
  "status": "ok", "practice_gap": 13.857, "practice_spread": 3.646, "delta": -0.161,
  "per_instance": { "ta41": 15.097, "swv11": 16.94, "...": "..." },
  "practice_runs": { "ta41": { "runs": [ { "score": 2336, "secs": 1.6027 }, "..." ] }, "...": "..." },
  "check_gap": 16.035
}
```

**MongoDB features doing real work:**

| Feature | Where | What it does |
|---|---|---|
| **Change streams** | `engine/api.py` `Hub` | One `events.watch()` (inserts only) pushes every bot action to all connected browsers over server-sent events, with resume tokens. Falls back to polling by `_id` if change streams are unavailable. |
| **`$graphLookup`** | `engine/store.py` `lineage()` | One query walks `parent_id` back through every ancestor of a strategy. The board's **family tree** tab shows how the winning idea evolved, round by round. |
| **Aggregation pipeline** | `store.usage_totals()` | `$match` + `$group` totals Luminal calls and tokens per run for the board's counters. |
| **TTL index** | `presence.last_seen` | Viewers who stop sending heartbeats expire automatically after 5 minutes. |
| **Compound indexes** | `strategies(run_id, round)`, `events(run_id, _id)`, `rounds(run_id, n)`, `messages(run_id, ts)` | Keep the state, leaderboard and stream queries fast as runs pile up. |
| **Batched writes** | `loop.py` | One `insert_many` of strategies and one round document per round, which fits Atlas free-tier limits. |

**Collections** (database `botteam`; counts after today's runs):

| Collection | Documents | Holds |
|---|---|---|
| `runs` | 15 | each run: team size, settings, baselines, solver line, splits commit, status |
| `rounds` | 78 | per round: best strategy, check gap, leaderboard, the calendar to draw, playbook snapshot |
| `strategies` | 302 | every strategy a bot wrote (code, scores, lineage, all test runs) |
| `events` | 1,295 | the live event log: assignments, proposals, scores, hires and fires, messages |
| `bots` | 121 | each bot's hire and fire rounds and its assigned angle |
| `lessons` | 63 | the playbook after every round |
| `usage` | 409 | every Luminal call: role, tokens in and out, seconds (885k tokens in, 2.3M out today) |
| `messages`, `presence` | — | human steering messages and who is watching |

The final evaluation also records its result as a `final_result` event, so the proof sits next to the run that produced it.

## Stack

Luminal Cloud (DeepSeek-V4.1-Flash, streamed) · Python 3.12+ asyncio · FastAPI + server-sent events · MongoDB Atlas · Next.js + Tailwind + Recharts · Google OR-Tools CP-SAT (reference only) · AWS Lambda runner (optional, `RUNNER=lambda`).
