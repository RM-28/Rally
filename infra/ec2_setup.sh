#!/usr/bin/env bash
# One-shot setup for the engine + API on a fresh Ubuntu 24.04 EC2 box (Phase 8).
#
#   # on the box, from the repo root (git clone or scp'd copy), with .env already copied in:
#   bash infra/ec2_setup.sh
#
# Installs Python + Caddy, builds the venv, clones JSPLIB, runs uvicorn as a systemd
# service on 127.0.0.1:8000 and puts Caddy in front with an automatic HTTPS certificate
# for <public-ip-with-dashes>.sslip.io. Safe to rerun (e.g. after a git pull).
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_USER="$(id -un)"
cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "missing $APP_DIR/.env: copy it from your laptop first (scp .env ubuntu@<ip>:$APP_DIR/.env)" >&2
  exit 1
fi

# public IP via IMDSv2 -> sslip.io hostname
TOKEN=$(curl -fsS -X PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
IP=$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)
HOST="${IP//./-}.sslip.io"
echo "public address: https://$HOST"

sudo apt-get update -y
sudo apt-get install -y python3.12-venv git caddy

[ -d .venv ] || python3.12 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt
[ -d data/JSPLIB ] || git clone --depth 1 https://github.com/tamy0612/JSPLIB data/JSPLIB

# one worker only: the active run lives in the API process
sudo tee /etc/systemd/system/botteam.service >/dev/null <<EOF
[Unit]
Description=Bot Team engine + API
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
# strategy code is untrusted and this box holds .env and an instance role: run it on Lambda only
# (these override .env; attach the botteam-runner-invoke policy to the instance role)
Environment=RUNNER=lambda
Environment=ALLOW_LOCAL_RUNNER=0
ExecStart=$APP_DIR/.venv/bin/uvicorn engine.api:app --host 127.0.0.1 --port 8000 --workers 1
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
$HOST {
    reverse_proxy 127.0.0.1:8000 {
        flush_interval -1
    }
}
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now botteam
sudo systemctl restart botteam
sudo systemctl reload caddy || sudo systemctl restart caddy

sleep 3
curl -fsS http://127.0.0.1:8000/api/state >/dev/null && echo "API up locally"
echo
echo "Next:"
echo "  1. curl https://$HOST/api/state   (first call may take ~20 s while Caddy gets the certificate)"
echo "  2. Amplify env: NEXT_PUBLIC_API_URL=https://$HOST"
echo "  3. .env here: WEB_ORIGIN=<amplify url>,http://localhost:3000  then: sudo systemctl restart botteam"
echo "Logs: journalctl -u botteam -f   |   journalctl -u caddy -f"
