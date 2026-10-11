"""'Schedule your team': turn a user's people/projects/tasks into a job-shop instance and back."""
from __future__ import annotations

MAX_PROJECTS = 60
MAX_PEOPLE = 30
MAX_TASKS = 1500
MAX_HOURS = 10_000


def build_instance(tasks: list[dict], downtime: list[dict] | None = None,
                   release: list[dict] | None = None) -> tuple[dict, list[str], list[str]]:
    """tasks: [{project, person, hours}] in order within each project.
    downtime: [{person, start, end}]; release: [{project, at}].
    Returns (instance, people, projects). Raises ValueError with a user-facing message."""
    if not tasks:
        raise ValueError("add at least one task")
    if len(tasks) > MAX_TASKS:
        raise ValueError(f"at most {MAX_TASKS} tasks")
    people: list[str] = []
    projects: list[str] = []
    steps: dict[str, list[tuple[str, int]]] = {}
    for i, t in enumerate(tasks, 1):
        project, person = str(t.get("project", "")).strip(), str(t.get("person", "")).strip()
        if not project or not person:
            raise ValueError(f"task {i}: project and person are required")
        try:
            hours = int(t.get("hours"))
        except (TypeError, ValueError):
            raise ValueError(f"task {i}: hours must be a whole number") from None
        if not 1 <= hours <= MAX_HOURS:
            raise ValueError(f"task {i}: hours must be between 1 and {MAX_HOURS}")
        if person not in people:
            people.append(person)
        if project not in steps:
            projects.append(project)
            steps[project] = []
        steps[project].append((person, hours))
    if len(projects) > MAX_PROJECTS or len(people) > MAX_PEOPLE:
        raise ValueError(f"at most {MAX_PROJECTS} projects and {MAX_PEOPLE} people")

    jobs = [[[people.index(p), h] for p, h in steps[name]] for name in projects]

    dt: dict[str, list[list[int]]] = {}
    for i, d in enumerate(downtime or [], 1):
        person = str(d.get("person", "")).strip()
        if person not in people:
            raise ValueError(f"time off {i}: '{person}' has no tasks")
        a, b = int(d.get("start")), int(d.get("end"))
        if not 0 <= a < b <= 10 * MAX_HOURS:
            raise ValueError(f"time off {i}: start must be before end")
        dt.setdefault(str(people.index(person)), []).append([a, b])

    rel = None
    for i, r in enumerate(release or [], 1):
        project = str(r.get("project", "")).strip()
        if project not in projects:
            raise ValueError(f"late start {i}: unknown project '{project}'")
        at = int(r.get("at"))
        if not 0 <= at <= 10 * MAX_HOURS:
            raise ValueError(f"late start {i}: hour out of range")
        rel = rel or [0] * len(projects)
        rel[projects.index(project)] = at

    inst = {"id": "your-team", "jobs": jobs, "n_machines": len(people), "release": rel, "downtime": dt or None}
    return inst, people, projects
