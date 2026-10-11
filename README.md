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

**Schedule your team.** The board's "Schedule your team" panel (API: `POST /api/schedule`) takes your own people, projects and tasks (plus optional time off and late starts), runs the bot team's frozen best strategy on them in the same sandbox, and shows its calendar next to first come, first served. It never tunes anything, so the final results stay valid. On a 600-task team (20 people, 30 projects) it finishes 20% sooner, in under 4 seconds.

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
