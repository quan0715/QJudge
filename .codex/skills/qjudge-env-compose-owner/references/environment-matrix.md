# QJudge Environment Matrix

## Environments

| Environment | How | Intended use |
| --- | --- | --- |
| `dev` | `qjudge-dc.sh dev` (`deploy/compose.yml` + `deploy/compose.build.yml` + `compose.dev.yml`, env `deploy/.env`) | local development, Storybook, database-free tests |
| CI | `.github/workflows/ci.yml`, `e2e-coding.yml`, `e2e-manual.yml` | database-backed backend tests, integration tests, E2E |
| Production | `deploy/qjudge` (`deploy/compose.yml` + `deploy/compose.build.yml`, addons under `deploy/addons/`) | self-hosted installs |

## Dev

The Compose project name is `COMPOSE_PROJECT_NAME` from `deploy/.env`; keep the existing value so the dev volumes are reused. Validate the env file with `deploy/qjudge check`. The dev network is project-local, so worktrees with their own `deploy/.env` and project name do not collide except on published ports.

| Role | Services |
| --- | --- |
| Web/API | `backend`, `frontend` (Vite on 5173), `storybook` |
| AI runtime | `ai-service`, `ai-worker`, `ai-scheduler` |
| Data | `postgres`, `pgbouncer`, `redis`, `minio` |
| Workers | `celery`, `celery-high`, `celery-beat`, `integrity-resident`, `integrity-reconciler` |
| MCP | `qjudge-mcp` (host port 9002) |
| One-off | `migrate`, `ai-migrate`, `ai-oauth-bootstrap`, `integrity-bootstrap`, `storage-init`, `judge-image` |
| Profiles | `livekit` (`live-monitoring`, reads `.tmp/livekit/dev.json`), `cloudflared` (`tunnel`) |

```bash
# Runtime
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d --build
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev ps
./scripts/dev/check-dev-services.sh

# First start on a new checkout: keys before the first up, bucket after it
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev run --rm integrity-bootstrap
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev run --rm storage-init

# Database-free backend tests
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend \
  python -m pytest -q --ds=config.settings.test <test path>

# AI-service tests (no CI job runs them)
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T ai-service python -m pytest -q <test path>

# Frontend checks
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run lint
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run typecheck
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run test

# Storybook
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T storybook npm run build-storybook
```

Never run `dev down -v`: it deletes the dev database and MinIO data.

## CI

| Job | Runs |
| --- | --- |
| Backend Unit Tests | backend `pytest` against a GitHub service PostgreSQL |
| Judge Tests | judge and submission tests with the judge image |
| Integration Tests | `ci/e2e-stack.sh`, then `npm run test:api` and MCP integration tests |
| Integrity Service Tests | `integrity-service/Dockerfile.test` |
| `e2e-coding.yml` | pull requests to `main`: auth and coding submission Playwright specs |
| `e2e-manual.yml` | manual dispatch by group |

`ci/e2e-stack.sh` runs `deploy/qjudge init --non-interactive` (origin `http://localhost:8080`, bundled storage), `addon storage up|init`, `upgrade <HEAD>`, restarts with `ci/compose.e2e.yml` (test settings, asynchronous Celery, fake AI adapters), seeds with `seed_e2e_data`, and exports the stack's compose command as `QJ_DC`. Extra `--set KEY=VALUE` arguments override the `init` defaults.

A local fresh-install run is only for when the user asks: create a separate worktree (`git worktree add --detach <dir> HEAD`), run `<dir>/ci/e2e-stack.sh --set COMPOSE_PROJECT_NAME=qjudge-e2e`, and point Playwright or Vitest at `http://localhost:8080`. Bundled storage needs ports 9000/9001, which dev MinIO also uses, and a `127.0.0.1 minio` hosts entry; otherwise pass external storage with `--set`. Clean up with `docker compose -p qjudge-e2e down -v` and `docker compose -p qjudge-e2e-storage down -v` only, then remove the worktree.

## Production

```bash
deploy/qjudge init        # create deploy/.env (refuses to overwrite)
deploy/qjudge check       # validate deploy/.env
deploy/qjudge addon storage up|init
deploy/qjudge addon media init|up
deploy/qjudge ingress [--nginx]
deploy/qjudge upgrade <ref>
deploy/qjudge rollback
```

The project name is `COMPOSE_PROJECT_NAME` (default `qjudge`); addons run as `<project>-storage` and `<project>-media`. Inspect with `docker compose -p <project> ps|logs|exec`. `upgrade` backs up both databases to `deploy/backups/`, records versions in `deploy/.version`, and never restores the database automatically. The public guide is `frontend/public/docs/zh-TW/deployment*.md`.

## Operational notes

- Judge and integrity coverage may require Docker socket access and the relevant worker services. A passing Celery-eager unit test is not evidence of a live Docker judge or integrity worker lifecycle.
- Use service names, not container names, with Compose.
- Compose management commands such as `up`, `down`, `ps`, `logs`, and `config` run through the wrapper; service-dependent application commands run through `exec -T`; service-independent static checks may run on a matching host runtime.
