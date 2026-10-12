"""The decoder/scorer: the only judge of a strategy's output."""
import pytest

from engine.jobs import get_job
from engine.jobs.jobshop.decoder import decode
from engine.jobs.jobshop.instances import parse_jsplib

# JSPLIB ft06 (Fisher and Thompson 6x6), inlined because data/JSPLIB is not in git. Optimum: 55.
FT06 = """\
# instance ft06
6 6
2  1  0  3  1  6  3  7  5  3  4  6
1  8  2  5  4 10  5 10  0 10  3  4
2  5  3  4  5  8  0  9  1  1  4  7
1  5  0  5  2  5  3  3  4  8  5  9
2  9  1  3  4  5  5  4  0  3  3  1
1  3  3  3  5  9  0 10  4  4  2  1
"""
FT06_OPTIMUM = 55


@pytest.fixture
def ft06():
    return parse_jsplib(FT06, "ft06")


def baseline_output(name, inst):
    ns = {}
    exec(get_job("jobshop").baselines()[name], ns)  # trusted repo code, run in-process for the test
    return ns["solve"](inst["jobs"], inst["n_machines"], 1.0)


def assert_valid_schedule(inst, makespan, ops):
    jobs = inst["jobs"]
    assert len(ops) == sum(len(j) for j in jobs)
    by_job, by_machine = {}, {}
    for j, k, m, s, e in ops:
        assert jobs[j][k] == [m, e - s], "op runs on the wrong machine or for the wrong time"
        by_job.setdefault(j, []).append((k, s, e))
        by_machine.setdefault(m, []).append((s, e))
    for j, steps in by_job.items():
        steps.sort()
        assert [k for k, _, _ in steps] == list(range(len(jobs[j])))
        for (_, _, e1), (_, s2, _) in zip(steps, steps[1:]):
            assert s2 >= e1, f"job {j} starts a step before the previous one ends"
    for m, spans in by_machine.items():
        spans.sort()
        for (_, e1), (s2, _) in zip(spans, spans[1:]):
            assert s2 >= e1, f"machine {m} runs two ops at once"
    assert makespan == max(e for *_, e in ops)


@pytest.mark.parametrize("name", ["fcfs", "simple_rule"])
def test_decoder_gives_valid_makespan_on_ft06(ft06, name):
    ms, ops = decode(ft06["jobs"], ft06["n_machines"], baseline_output(name, ft06))
    assert_valid_schedule(ft06, ms, ops)
    assert ms >= FT06_OPTIMUM


def test_known_schedules_score_what_they_should(ft06):
    job = get_job("jobshop")
    assert job.score(ft06, baseline_output("fcfs", ft06)) == 60.0
    assert job.score(ft06, baseline_output("simple_rule", ft06)) == 88.0


TWO_BY_TWO = [[[0, 3], [1, 2]], [[1, 4], [0, 1]]]


def test_hand_worked_schedule():
    ms, ops = decode(TWO_BY_TWO, 2, [0, 1, 0, 1])
    assert ms == 6
    assert ops == [(0, 0, 0, 0, 3), (1, 0, 1, 0, 4), (0, 1, 1, 4, 6), (1, 1, 0, 4, 5)]


def test_downtime_pushes_an_op_past_the_window():
    # machine 1 is down 1..3, so job 1's first op (4h) cannot start at 0
    ms, ops = decode(TWO_BY_TWO, 2, [0, 1, 0, 1], downtime={"1": [[1, 3]]})
    assert ms == 9
    assert ops[1] == (1, 0, 1, 3, 7)


def test_release_delays_a_job():
    ms, ops = decode(TWO_BY_TWO, 2, [0, 1, 0, 1], release=[0, 2])
    assert ms == 8
    assert ops[1] == (1, 0, 1, 2, 6)


@pytest.mark.parametrize("seq, msg", [
    ([0, 1, 0], "wrong length"),
    ([0, 0, 0, 1], "too many times"),
    ([0, 1, 0, 2], "out of range"),
    ([0, 1, 0, 1.5], "not an integer"),
    ([0, 1, 0, True], "not an integer"),
    ("0101", "must be a list"),
])
def test_invalid_output_raises(seq, msg):
    with pytest.raises(ValueError, match=msg):
        decode(TWO_BY_TWO, 2, seq)
