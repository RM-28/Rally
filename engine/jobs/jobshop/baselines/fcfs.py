def solve(jobs, n_machines, time_limit, release=None, downtime=None):
    # First come, first served: step 1 of every job in job order, then step 2, and so on.
    seq = []
    for k in range(max(len(j) for j in jobs)):
        for j in range(len(jobs)):
            if k < len(jobs[j]):
                seq.append(j)
    return seq
