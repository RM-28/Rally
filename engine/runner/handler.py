"""AWS Lambda entry point. Same contract as local.py for one request; calls child.py in a subprocess."""
from engine.runner.core import run_one


def lambda_handler(event, context):
    return run_one(event["job"], event["strategy_code"], event["instance_id"],
                   float(event["time_limit"]), int(event["repeats"]),
                   instance=event.get("instance"), keep_output=bool(event.get("keep_output")))
