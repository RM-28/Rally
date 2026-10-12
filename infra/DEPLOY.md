# Deploy notes

## Lambda runner (Phase 4)

Preferred: the SAM template `infra/template.yaml` (function, logs-only role, 14-day log group, invoke policy).

```bash
bash infra/package_lambda.sh
sam deploy -t infra/template.yaml --stack-name botteam-runner \
  --capabilities CAPABILITY_NAMED_IAM --resolve-s3 --region us-east-1
# without the SAM CLI, plain CloudFormation runs the same template (needs any S3 bucket for the code):
aws cloudformation package --template-file infra/template.yaml --s3-bucket <BUCKET> \
  --output-template-file infra/build/packaged.yaml --region us-east-1
aws cloudformation deploy --template-file infra/build/packaged.yaml --stack-name botteam-runner \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND --region us-east-1
```

Attach the `botteam-runner-invoke` policy to the caller (EC2 instance role or a developer's user).
Strategy code is untrusted: on any machine holding secrets set `RUNNER=lambda` and `ALLOW_LOCAL_RUNNER=0`
(`infra/ec2_setup.sh` puts both in the systemd unit), so strategies never run on that machine.

By hand, without CloudFormation:

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

Quick path (about 15 minutes):

1. EC2 console, Launch instance: Ubuntu 24.04, `t3.medium` (`c7i.xlarge` if `RUNNER=local`, since tests run
   on the box's CPUs), a key pair, security group allowing 22 (your IP), 80 and 443 (anywhere).
   Attach an instance role with the `botteam-runner-invoke` policy: the service runs strategies on Lambda only.
   Optional but wise: allocate an Elastic IP so the address survives a stop/start.
2. Get the code and env onto the box:
   ```bash
   ssh -i key.pem ubuntu@<ip>
   git clone https://github.com/RM-28/Project-Unkown app      # private repo: use a token, or scp the folder
   exit
   scp -i key.pem .env ubuntu@<ip>:app/.env
   ```
3. `ssh -i key.pem ubuntu@<ip> 'bash app/infra/ec2_setup.sh'` prints `https://<ip-with-dashes>.sslip.io`.
4. Amplify (below), then on the box set `WEB_ORIGIN=https://main.<id>.amplifyapp.com,http://localhost:3000`
   in `.env` and `sudo systemctl restart botteam`.
5. Done when the Amplify URL works on a phone on mobile data, and the live dot in the header is green.

What the script does, by hand:

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

Amplify console, Create app, GitHub, pick the repo and `main`, tick "my app is a monorepo", app root `web`.
`amplify.yml` at the repo root holds the build settings. Before the first build, add these under
App settings > Environment variables (they are baked in at build time, so changing one needs a redeploy):

| Variable | Value | Needed |
|---|---|---|
| `AMPLIFY_MONOREPO_APP_ROOT` | `web` | yes (Amplify sets it when you tick monorepo) |
| `NEXT_PUBLIC_API_URL` | the engine, e.g. `https://1-2-3-4.sslip.io` | yes: the build stops without it |
| `NEXT_PUBLIC_BOARD_URL` | e.g. `https://main.<app-id>.amplifyapp.com` | optional: the QR code, defaults to the browser's address |
| `NEXT_PUBLIC_LUMINAL_PRICE_PER_M` | e.g. `0.30` | optional: Usage card cost, else viewers type a rate |
| `NEXT_PUBLIC_RALLY_USER` | a seeded Rally person id | optional: defaults to `test` |

All of these are public (they reach the browser). Secrets stay in the engine's `.env` on EC2, never in
Amplify. The build copies every `NEXT_PUBLIC_*` variable into `web/.env.production` and logs their names.
The full list with comments is in `web/.env.example`; the engine's is in `.env.example`.

Fallback (same origin, no CORS/HTTPS fights): `cd web && STATIC_EXPORT=1 NEXT_PUBLIC_API_URL= npm run build`,
then FastAPI serves `web/out` at `/`.

Last resort: everything on a laptop. The demo must not depend on the deploy.
