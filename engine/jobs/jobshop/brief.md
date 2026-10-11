# The job: job-shop scheduling

You are writing a scheduling strategy. There are `n` jobs (projects) and `n_machines` machines (people). Each job is a fixed sequence of steps; each step needs one specific machine for a fixed duration. A machine does one step at a time, a job does one step at a time, and steps of a job run in order. Goal: **minimise the makespan** (the time the last step finishes).

## Your file

One Python file, standard library only. Allowed imports: `math, random, time, heapq, itertools, collections, functools, bisect, array, operator, copy`. Max 30 KB. No file, network or OS access.

```python
def solve(jobs, n_machines, time_limit, release=None, downtime=None):
    # jobs[j] = list of [machine, duration] in the order job j must run them
    # release[j] = earliest start time of job j (None means all zero)
    # downtime[m] = list of [start, end] windows when machine m is unavailable (None means none)
    # return a list of job ids. Job id j must appear len(jobs[j]) times.
    # The k-th appearance of j means "schedule job j's k-th step next".
```

## How the output is scored (exactly this decoder)

```python
def makespan(jobs, n_machines, seq, release=None, downtime=None):
    n = len(jobs)
    nxt = [0] * n
    job_ready = list(release) if release else [0] * n
    mach_ready = [0] * n_machines
    for j in seq:
        k = nxt[j]
        mc, d = jobs[j][k]
        start = max(job_ready[j], mach_ready[mc])
        if downtime:
            for a, b in sorted(downtime[mc]):
                if start < b and start + d > a:   # would overlap the window
                    start = b
        job_ready[j] = mach_ready[mc] = start + d
        nxt[j] = k + 1
    return max(job_ready)
```

Note: each step starts after the *last* step placed on its machine, so the order of appearances on each machine is what matters. A step never fills an earlier idle gap.

## Rules

- You have `time_limit` seconds (around 2). Check `time.time()` in every loop and return your best sequence by 80% of `time_limit`. Runs over 2.5x the limit score nothing.
- Instances are large: 30 to 50 jobs, 10 to 20 machines (up to 1000 steps). Keep inner loops cheap.
- Your score is the decoder's makespan, averaged over several runs. Invalid output scores nothing.
- Never catch an exception and silently return the starting schedule; fix the bug instead.
- `release` and `downtime` are usually None but your code must handle them.
