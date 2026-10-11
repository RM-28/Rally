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

Other scripts:

| Command | What it does |
|---|---|
| `python -m engine.scripts.compare_bots --rounds 3 --seeds 2` | 1 / 2 / 4 / 8 bot comparison (`--summarize` rebuilds the table from MongoDB) |
| `python -m engine.scripts.final_eval --strategy <id>` | the one-time held-out / fresh / events evaluation (`--dry-run` for a check) |
| `python -m engine.scripts.solver_ref` | CP-SAT reference scores for generated instances |
| `python -m engine.jobs.jobshop.generate` | fresh + event instances and `data/splits.json` |

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

## Stack

Luminal Cloud (DeepSeek-V4.1-Flash, streamed) · Python 3.12+ asyncio · FastAPI + server-sent events · MongoDB Atlas · Next.js + Tailwind + Recharts · Google OR-Tools CP-SAT (reference only) · AWS Lambda runner (optional, `RUNNER=lambda`).
