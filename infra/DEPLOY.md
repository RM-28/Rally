# Deploy notes

## Lambda runner (Phase 4)

```bash
bash infra/package_lambda.sh
# one-time: an execution role with ONLY AWSLambdaBasicExecutionRole (logs). No VPC, no env vars, no secrets.
aws iam create-role --role-name botteam-runner-role \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name botteam-runner-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws lambda create-function --function-name botteam-runner --runtime python3.12 \
  --handler engine.runner.handler.lambda_handler --memory-size 2048 --timeout 60 \
  --role arn:aws:iam::<ACCOUNT_ID>:role/botteam-runner-role \
  --zip-file fileb://infra/build/runner.zip --region us-east-1
# updates:
aws lambda update-function-code --function-name botteam-runner --zip-file fileb://infra/build/runner.zip
# check concurrency (new accounts are often limited to 10):
aws lambda get-account-settings --query AccountLimit.ConcurrentExecutions
```

Then set `RUNNER=lambda` and compare: `python -m engine.scripts.baseline --runner lambda` must match local.

## Engine + API on EC2 (Phase 8)

```bash
sudo apt update && sudo apt install -y python3.12-venv git caddy
git clone <repo> app && cd app && python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
git clone --depth 1 https://github.com/tamy0612/JSPLIB data/JSPLIB
cp .env.example .env   # fill in; WEB_ORIGIN = the Amplify URL
.venv/bin/uvicorn engine.api:app --host 127.0.0.1 --port 8000   # or a systemd unit
```

`/etc/caddy/Caddyfile` (hostname = public IP with dashes, gets an automatic certificate):

```
1-2-3-4.sslip.io {
    reverse_proxy 127.0.0.1:8000 {
        flush_interval -1
    }
}
```

`flush_interval -1` keeps server-sent events streaming. Open ports 80 and 443 in the security group.

## Board on Amplify

App root `web`, env `NEXT_PUBLIC_API_URL=https://1-2-3-4.sslip.io`.

Fallback (same origin, no CORS/HTTPS fights): `cd web && STATIC_EXPORT=1 NEXT_PUBLIC_API_URL= npm run build`,
then FastAPI serves `web/out` at `/`.

Last resort: everything on a laptop. The demo must not depend on the deploy.
