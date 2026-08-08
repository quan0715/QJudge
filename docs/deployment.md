# QJudge Deployment And Compose Guide

Updated: 2026-08-08

This is the canonical deployment and Docker Compose guide for QJudge. Use this
instead of dated architecture snapshots or archived design notes.

## Compose Matrix

| Environment | Compose file | Wrapper env | Main purpose |
| --- | --- | --- | --- |
| Production | `docker-compose.yml` | `main` | Cloud VM or self-hosted Docker host |
| Development | `docker-compose.dev.yml` | `dev` | Local app stack with hot reload and Storybook |
| Test / E2E | `docker-compose.test.yml` | `test` | Isolated CI and Playwright/API test stack |

Use the project wrapper so service names and test aliases stay consistent:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d --build
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev ps
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test config -q
```

The `test` wrapper accepts canonical aliases such as `backend` and rewrites them
to test services such as `backend-test`.

## Service Topology

### Production

Production runs the application on one Docker Compose host:

- `frontend`: React build served by Nginx on port 80.
- `backend`: Django/Daphne, migrations, static collection, API and ASGI.
- `ai-service`: FastAPI DeepAgent service.
- `qjudge-mcp`: MCP OAuth/tool proxy.
- `postgres` and `pgbouncer`: PostgreSQL 15 plus session-mode pooling.
- `redis`: Celery broker, result backend, cache, and channel layer.
- `celery`, `celery-high`, `celery-beat`: background workers and schedules.
- `judge-image`: verifies the judge runtime image exists before workers start.
- External S3-compatible object storage: anti-cheat evidence, markdown images,
  and AI artifacts.
- Optional `cloudflared` profile: Cloudflare Tunnel ingress.

Production compose forces these runtime overrides so a copied dev `.env` cannot
silently leak into production containers:

```bash
DJANGO_ENV=production
DEBUG=False
DJANGO_SETTINGS_MODULE=config.settings.prod
DB_HOST=pgbouncer
DB_PORT=5432
DB_SSLMODE=disable
REDIS_URL=redis://redis:6379/0
```

### Development

Development uses the same core services with hot reload:

- `frontend` on `http://localhost:5173`
- `storybook` on `http://localhost:6006`
- `backend` on `http://localhost:8000`
- `ai-service` on `http://localhost:8001`
- `qjudge-mcp` on `http://localhost:9002/mcp`
- `postgres`, `pgbouncer`, `redis`, `celery`, `celery-beat`

`cloudflared` is behind the optional `tunnel` profile:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev --profile tunnel up -d cloudflared
```

### Test / E2E

The test stack is isolated from dev and production:

- `backend-test` on host port `8002`
- `frontend-test` on host port `5174`
- `postgres-test` on host port `5433`
- `redis-test` on host port `6380`
- `celery-test`

`backend-test` uses `config.settings.test` and direct PostgreSQL connection
variables (`POSTGRES_*`) by design. Django's test runner needs direct database
access for test database creation and teardown.

## Environment Files

The root `.env` file is intentionally ignored by git. Do not copy and manually
complete the old 94-variable template. Export the external storage values and let
the initializer generate internal secrets:

```bash
export OBJECT_STORAGE_ENDPOINT_URL=https://ACCOUNT_ID.r2.cloudflarestorage.com
export OBJECT_STORAGE_PUBLIC_ENDPOINT_URL="$OBJECT_STORAGE_ENDPOINT_URL"
read -r -p "R2 access key: " OBJECT_STORAGE_ACCESS_KEY
read -r -s -p "R2 secret key: " OBJECT_STORAGE_SECRET_KEY
export OBJECT_STORAGE_ACCESS_KEY OBJECT_STORAGE_SECRET_KEY
./scripts/setup-env.sh \
  --target self-hosted \
  --storage r2 \
  --origin http://HOST_OR_IP
```

Do not commit real secrets. Keep production `.env` only on the remote deploy
host and in the secret manager that provisions it.

### Required Production Variables

`scripts/setup-env.sh` writes the active file atomically, uses mode `0600`, refuses
to overwrite it without `--force`, and never prints secrets. The minimum contract is:

| Group | Variables |
| --- | --- |
| Deployment | `QJUDGE_PUBLIC_ORIGIN` |
| Generated secrets | `SECRET_KEY`, `POSTGRES_ADMIN_PASSWORD`, `DB_PASSWORD`, `AI_DB_PASSWORD`, `CREDENTIAL_LEASE_SECRET` |
| Object storage | `OBJECT_STORAGE_ENDPOINT_URL`, `OBJECT_STORAGE_PUBLIC_ENDPOINT_URL`, `OBJECT_STORAGE_ACCESS_KEY`, `OBJECT_STORAGE_SECRET_KEY` |

Database identities, internal service URLs, Redis databases, queue names, bucket names,
regions, TTLs and runtime limits are version-controlled defaults. The backend and workers
still receive the values they need inside their containers; operators do not maintain
them in the root `.env`.

`TUNNEL_TOKEN`, `MCP_PUBLIC_URL`, AI provider keys, third-party OAuth credentials,
SMTP credentials and Cloudflare Realtime credentials are optional. A Tunnel token
activates the `tunnel` Compose profile; an absent token leaves `cloudflared` stopped.

## Production Deploy Flow

GitHub Actions runs `.github/workflows/cd-prod.yml` after CI succeeds on `main`
or when manually dispatched. The workflow connects over Tailscale SSH and runs:

```bash
scripts/deploy-prod.sh "$PROD_DEPLOY_PATH" "$DEPLOY_SHA"
```

The deploy script:

1. Validates `.env`.
2. Checks out the requested git ref.
3. Pulls or builds the judge image as `oj-judge:latest`.
4. Builds and starts `docker-compose.yml`.
5. Runs the web smoke check.

## Verification

Before deploying a compose or env change:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh main config -q
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev config -q
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test config -q
```

With an initialized active env:

```bash
docker compose --env-file .env -f docker-compose.yml config -q
docker compose --env-file .env -f docker-compose.dev.yml config -q
docker compose -f docker-compose.test.yml config -q
```

The root `.env.example` is a schema reference and intentionally contains empty generated
secret fields. Validate the generated `.env`, not the template itself.

## Legacy Document Policy

Deployment docs should stay in active docs and be deleted when stale. Do not
move obsolete deployment or architecture notes into `docs/archive/`.
