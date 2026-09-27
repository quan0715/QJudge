This guide sets up the QJudge local development environment. It layers `compose.dev.yml` on top of the production `deploy/compose.yml`: source mounts, hot reload, localhost ports, and a MinIO inside the same Compose project. Configuration lives in `deploy/.env`, the same file a production install uses. To run a production site, see [Deployment](/docs/deployment) (Traditional Chinese).

This is the only local environment. Backend tests that need a database and the E2E suites run in CI (see section 6).

## 1. Requirements

- Git
- Docker with Compose v2
- Python 3 (runs `deploy/qjudge check`)

Node.js and the service Python packages live inside the containers.

## 2. Get the Code

```bash
git clone https://github.com/quan0715/QJudge.git
cd QJudge
```

## 3. Create `deploy/.env`

```bash
cp deploy/.env.example deploy/.env
```

Fill in these values and leave the rest empty:

```text
QJUDGE_PUBLIC_ORIGIN=http://localhost:5173
COMPOSE_PROJECT_NAME=qjudge-dev
SECRET_KEY=<random string>
POSTGRES_ADMIN_PASSWORD=<random string>
DB_PASSWORD=<random string>
AI_DB_PASSWORD=<random string>
CREDENTIAL_LEASE_SECRET=<random string>
HOST_PROJECT_ROOT=<absolute path of this checkout>
STORAGE_MODE=bundled
OBJECT_STORAGE_ENDPOINT_URL=http://minio:9000
OBJECT_STORAGE_PUBLIC_ENDPOINT_URL=http://localhost:9000
OBJECT_STORAGE_ACCESS_KEY=qjudge
OBJECT_STORAGE_SECRET_KEY=<random string, at least 8 characters>
OBJECT_STORAGE_BUCKET=qjudge
```

Generate random strings with `python3 -c 'import secrets; print(secrets.token_urlsafe(24))'`; database passwords may contain only letters, digits and `-._~`. `COMPOSE_PROJECT_NAME` names the containers and volumes, so give every checkout on the same machine its own name.

Validate the file:

```bash
deploy/qjudge check
```

Continue once it prints `…/deploy/.env: OK`.

## 4. Start the Services

Run every Compose command through the wrapper, which selects the right compose files. On the first start:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev build
docker pull --platform linux/amd64 ghcr.io/quan0715/qjudge/judge:latest
deploy/qjudge secrets --image qjudge/backend:dev
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev run --rm storage-init
```

`deploy/qjudge secrets` writes the AI OAuth and Integrity keys under `deploy/secrets/` that the services mount; they must exist before the first `up`, and existing keys are kept. The judge workers run submissions in the pulled judge image. `storage-init` creates `OBJECT_STORAGE_BUCKET` in MinIO. `backend` and `ai-service` apply migrations when they start.

For test accounts and sample problems:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py seed_e2e_data
```

Check the status:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev ps
./scripts/dev/check-dev-services.sh
```

| Service | URL |
| --- | --- |
| QJudge (Vite) | `http://localhost:5173` |
| Backend API | `http://localhost:8000` |
| AI Service | `http://localhost:8001` (`/health/live`, `/health/ready`) |
| Storybook | `http://localhost:6006`, or `http://localhost:5173/dev/storybook/` |
| MCP Server | `http://localhost:9002/mcp` |
| MinIO | API `http://localhost:9000`, console `http://localhost:9001` |

PostgreSQL, PgBouncer and Redis listen on `127.0.0.1` ports `5432`, `6432` and `6379`. If a port is taken, set `DEV_FRONTEND_PORT` and similar variables (names in `compose.dev.yml`) in the shell that runs the wrapper. Do not put them in `deploy/.env`; `check` reports them as unknown keys.

`COMPOSE_PROFILES` can add `tunnel` (requires `TUNNEL_TOKEN`) or `live-monitoring` (a development LiveKit that reads the untracked `.tmp/livekit/dev.json`).

## 5. Edit Code and Read Logs

The frontend, backend and ai-service sources are mounted into the containers, so most changes reload on save. After changing dependencies or a Dockerfile, run `dev up -d --build`.

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev logs -f frontend
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev logs -f backend
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev logs -f ai-service
```

`Ctrl+C` leaves the log view without stopping the services.

## 6. Run Tests

Frontend:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run lint
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run typecheck
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run test
```

AI Service:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T ai-service python -m pytest -q tests/unit
```

Backend tests that do not use the database can run in dev; pytest-django blocks database access from unmarked tests:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend \
  python -m pytest -q --ds=config.settings.test apps/ai/tests/test_start_run_serializer.py
```

There is no local test database. Backend tests that need one run in the CI Backend Unit Tests and Judge Tests jobs; integration and E2E tests run in CI against a freshly installed stack (see [E2E Testing](/docs/e2e-testing)).

## 7. Stop and Restart

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev down
```

This removes the containers but keeps the data volumes; run `dev up -d` to continue. Never use `down -v`: it deletes the local database and MinIO data.

Next, read the [Contributing Guide](/docs/contributing) for branch, test and documentation rules.
