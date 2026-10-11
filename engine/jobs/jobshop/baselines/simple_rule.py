def solve(jobs, n_machines, time_limit, release=None, downtime=None):
    # Always start the waiting step that can begin earliest, ties broken by shortest duration.
    n = len(jobs)
    windows = {}
    if downtime:
        for m, ws in enumerate(downtime):
            windows[m] = sorted(tuple(w) for w in ws)
    nxt = [0] * n
    job_ready = list(release) if release else [0] * n
    mach_ready = [0] * n_machines
    seq = []
    total = sum(len(j) for j in jobs)
    while len(seq) < total:
        best = None
        for j in range(n):
            k = nxt[j]
            if k >= len(jobs[j]):
                continue
            mc, d = jobs[j][k]
            start = max(job_ready[j], mach_ready[mc])
            for a, b in windows.get(mc, ()):
                if start < b and start + d > a:
                    start = b
            key = (start, d, j)
            if best is None or key < best[0]:
                best = (key, j, mc, start + d)
        _, j, mc, end = best
        job_ready[j] = mach_ready[mc] = end
        nxt[j] += 1
        seq.append(j)
    return seq
