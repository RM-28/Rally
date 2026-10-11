#!/usr/bin/env bash
# Builds infra/build/runner.zip for the botteam-runner Lambda (Python 3.12, 2048 MB, 60 s timeout).
# Handler: engine.runner.handler.lambda_handler. Standard library only, so no pip install is needed.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf infra/build && mkdir -p infra/build/pkg/engine infra/build/pkg/data/JSPLIB
cp engine/__init__.py engine/config.py infra/build/pkg/engine/
cp -r engine/jobs engine/runner infra/build/pkg/engine/
cp -r data/JSPLIB/instances data/JSPLIB/instances.json infra/build/pkg/data/JSPLIB/
cp -r data/generated data/splits.json infra/build/pkg/data/
[ -f data/reference.json ] && cp data/reference.json infra/build/pkg/data/
find infra/build/pkg -name __pycache__ -prune -exec rm -rf {} +
(cd infra/build/pkg && python -c "import shutil; shutil.make_archive('../runner', 'zip', '.')")
ls -lh infra/build/runner.zip
