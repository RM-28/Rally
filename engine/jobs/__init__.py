from engine.jobs.base import Job


def get_job(name: str) -> Job:
    if name == "jobshop":
        from engine.jobs.jobshop.job import JobShop
        return JobShop()
    raise KeyError(f"unknown job: {name}")
