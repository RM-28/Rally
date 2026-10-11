from typing import Protocol


class Job(Protocol):
    name: str            # "jobshop"
    entrypoint: str      # function name a strategy must define, "solve"

    def brief(self) -> str: ...                       # text handed to bots
    def sets(self) -> dict[str, list[str]]: ...       # quick, practice, check, heldout, fresh, events
    def load(self, instance_id: str) -> dict: ...     # JSON-serialisable instance
    def baselines(self) -> dict[str, str]: ...        # name -> strategy source code
    def score(self, instance: dict, output) -> float: ...   # raises ValueError if invalid. Lower is better
    def reference(self, instance_id: str) -> float: ...     # best-known or solver score
    def showcase(self, instance: dict, output) -> dict: ... # data for the board's calendar view
    # Addition to the plan's interface: keyword arguments for the entrypoint. The sandboxed
    # child cannot import the engine, so the parent builds the call and ships it as JSON.
    def call_args(self, instance: dict, time_limit: float) -> dict: ...


def gap(score: float, reference: float) -> float:
    return 100.0 * (score - reference) / reference
