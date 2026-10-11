"""sequence -> schedule -> score. The scorer is the only judge."""


def normalize_downtime(downtime):
    """JSON turns machine keys into strings; the decoder looks them up by int."""
    if not downtime:
        return None
    return {int(m): [tuple(w) for w in ws] for m, ws in downtime.items()}


def decode(jobs, n_machines, seq, release=None, downtime=None):
    """Returns (makespan, ops) where ops = [(job, step, machine, start, end), ...]."""
    if not isinstance(seq, (list, tuple)):
        raise ValueError(f"output must be a list of job ids, got {type(seq).__name__}")
    downtime = normalize_downtime(downtime)
    n = len(jobs)
    need = [len(j) for j in jobs]
    if len(seq) != sum(need):
        raise ValueError(f"wrong length: got {len(seq)}, need {sum(need)}")
    nxt = [0] * n
    job_ready = list(release) if release else [0] * n
    mach_ready = [0] * n_machines
    ops = []
    for j in seq:
        if isinstance(j, bool) or not isinstance(j, (int, float)) or int(j) != j:
            raise ValueError(f"job id {j!r} is not an integer")
        j = int(j)
        if not 0 <= j < n:
            raise ValueError(f"job id {j} out of range")
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
        ops.append((j, k, mc, start, start + d))
    return max(job_ready), ops


def makespan(jobs, n_machines, seq, release=None, downtime=None):
    return decode(jobs, n_machines, seq, release, downtime)[0]
