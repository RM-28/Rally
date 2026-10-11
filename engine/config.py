"""APP_NAME, env loading, constants. Keep APP_NAME in sync with web/lib/config.ts."""
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # the Lambda package has no dotenv and needs no env
    load_dotenv = None

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

if load_dotenv:
    load_dotenv(ROOT / ".env")

APP_NAME = "Rally"


def _env(name: str, default: str = "") -> str:
    # strip inline "# comment" so values copied from .env.example still work
    return os.environ.get(name, default).split("#", 1)[0].strip()


LUMINAL_API_KEY = _env("LUMINAL_API_KEY")
LUMINAL_BASE_URL = _env("LUMINAL_BASE_URL")
LUMINAL_MODEL = _env("LUMINAL_MODEL", "deepseek-ai/DeepSeek-V4.1-Flash")
MONGODB_URI = _env("MONGODB_URI")
MONGODB_DB = _env("MONGODB_DB", "botteam")
AWS_REGION = _env("AWS_REGION", "us-east-1")
LAMBDA_FUNCTION_NAME = _env("LAMBDA_FUNCTION_NAME", "botteam-runner")
RUNNER = _env("RUNNER", "local")
TIME_LIMIT_S = float(_env("TIME_LIMIT_S", "2.0"))
REPEATS = int(_env("REPEATS", "3"))
N_BOTS = int(_env("N_BOTS", "4"))
WEB_ORIGIN = _env("WEB_ORIGIN", "http://localhost:3000")
ADMIN_TOKEN = _env("ADMIN_TOKEN")
MODEL_MOCK = _env("MODEL_MOCK", "0") == "1"   # offline wiring tests only
RALLY_TZ = _env("RALLY_TZ", "America/Los_Angeles")   # studio time for Rally routines and prompts

ROSTER = [
    "Atlas", "Bishop", "Cleo", "Dash", "Echo", "Fig", "Gus", "Halo",
    "Indy", "Juno", "Kit", "Lark", "Moss", "Nova", "Otis", "Pip",
]

ALLOWED_IMPORTS = {
    "math", "random", "time", "heapq", "itertools", "collections",
    "functools", "bisect", "array", "operator", "copy",
}
MAX_STRATEGY_BYTES = 30 * 1024
