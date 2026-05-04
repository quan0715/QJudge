# QJudge Deployment And Compose Guide

Updated: 2026-05-04

This is the canonical deployment and Docker Compose guide for QJudge. Use this
instead of dated architecture snapshots or archived design notes.

## Compose Matrix

| Environment | Compose file | Wrapper env | Main purpose |
| --- | --- | --- | --- |
| Production | `docker-compose.yml` | `main` | Remote Docker host behind Cloudflare Tunnel |
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
- `minio`: local S3-compatible fallback, not the preferred production store.
- `cloudflared`: Cloudflare Tunnel ingress.
- `glitchtip` and `glitchtip-worker`: error tracking.
- `docker-compose.monitoring.yml`: Prometheus, Grafana, and exporters overlay.

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
- `postgres`, `pgbouncer`, `redis`, `minio`, `celery`, `celery-beat`

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

The root `.env` file is intentionally ignored by git. Start from:

```bash
cp .env.example .env
```

Do not commit real secrets. Keep production `.env` only on the remote deploy
host and in the secret manager that provisions it.

### Required Production Variables

`scripts/deploy-prod.sh` fails fast if required keys are absent or still use
placeholder values. Required groups:

| Group | Variables |
| --- | --- |
| Django | `SECRET_KEY`, `FRONTEND_URL`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` |
| Database | `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSLMODE`, `REDIS_URL` |
| AI | `AI_SERVICE_INTERNAL_TOKEN` |
| Frontend billing | `RECUR_PUBLISHABLE_KEY` |
| Tunnel / MCP | `TUNNEL_TOKEN`, `MCP_PUBLIC_URL`, `OAUTH_ISSUER_URL` |
| Operations | `GLITCHTIP_SECRET_KEY`, `GRAFANA_PASSWORD` |
| Object storage | `OBJECT_STORAGE_ENDPOINT_URL` plus either external storage credentials or local MinIO keys |

For external S3-compatible storage, including Cloudflare R2, also set:

```bash
OBJECT_STORAGE_PUBLIC_ENDPOINT_URL=
OBJECT_STORAGE_REGION=auto
OBJECT_STORAGE_ACCESS_KEY=
OBJECT_STORAGE_SECRET_KEY=
ANTICHEAT_RAW_BUCKET=
MARKDOWN_IMAGE_S3_BUCKET=
MARKDOWN_IMAGE_PUBLIC_BASE_URL=https://q-judge.com
AI_ARTIFACT_S3_BUCKET=
```

For local MinIO production fallback, also set non-default values:

```bash
MINIO_ROOT_USER=
MINIO_ROOT_PASSWORD=
MINIO_API_CORS_ALLOW_ORIGIN=https://q-judge.com
```

The backend only reads `OBJECT_STORAGE_*` for S3-compatible access. `MINIO_*`
exists for the local MinIO service and initialization scripts.

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
4. Builds and starts `docker-compose.yml` plus `docker-compose.monitoring.yml`.
5. Initializes local MinIO only when `OBJECT_STORAGE_ENDPOINT_URL` points to the compose MinIO service and `SKIP_MINIO_INIT` is not `1`.
6. Runs web and Grafana smoke checks.

## Verification

Before deploying a compose or env change:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh main config -q
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev config -q
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test config -q
```

With only the template env:

```bash
docker compose --env-file .env.example -f docker-compose.yml config -q
docker compose --env-file .env.example -f docker-compose.dev.yml config -q
docker compose -f docker-compose.test.yml config -q
```

## Legacy Document Policy

Deployment docs should stay in active docs and be deleted when stale. Do not
move obsolete deployment or architecture notes into `docs/archive/`.
