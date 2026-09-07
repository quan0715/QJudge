# QJudge Environment Matrix

## Compose files

| Environment | File | Intended use |
| --- | --- | --- |
| `main` | `docker-compose.yml` | production-shaped runtime |
| `dev` | `docker-compose.dev.yml` | interactive development and Storybook |
| `test` | `docker-compose.test.yml` | isolated tests and E2E |

## Current services

| Environment | Web/API | AI runtime | Data | Workers | UI |
| --- | --- | --- | --- | --- | --- |
| `main` | `backend` | `ai-service`, `ai-worker`, `ai-scheduler` | `postgres`, `redis` | `celery`, `celery-high`, `celery-beat` | `frontend` |
| `dev` | `backend` | `ai-service`, `ai-worker`, `ai-scheduler` | `postgres`, `redis` | `celery`, `celery-high`, `celery-beat` | `frontend`, `storybook` |
| `test` | `backend-test` | `ai-service`, `ai-worker`, `ai-scheduler` | `postgres-test`, `redis-test` | `celery-test`, `celery-high-test` | `frontend-test` |

The test stack also contains bootstrap, fake-adapter, migration, and integrity services. Inspect `docker-compose.test.yml` before diagnosing those dependencies.

## Canonical commands

```bash
# Development runtime
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d --build
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev ps
./scripts/dev/check-dev-services.sh

# Backend tests
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test up -d backend-test
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T \
  -e POSTGRES_DB=postgres \
  -e POSTGRES_USER=qjudge_test_admin \
  -e POSTGRES_PASSWORD=qjudge_test_admin_password \
  backend-test pytest -q

# AI-service tests
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test up -d ai-service
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T ai-service pytest -q

# Frontend checks
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test up -d frontend-test
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npm run lint
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T frontend-test npm run typecheck

# Storybook belongs to dev
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T storybook npm run build-storybook
```

## Operational notes

- `backend-test` runs with `config.settings.test` and prepares E2E state on startup.
- The backend application process uses the least-privileged `qjudge_web` role. Django pytest needs to create and drop a separate temporary database, so the canonical pytest command overrides only the test process with the administrator of the isolated `postgres-test` instance.
- The test frontend reaches Django at `backend-test:8000`; the backend reaches AI at `ai-service:8001`.
- Judge and integrity coverage may require Docker socket access and the relevant worker/controller services. A passing Celery-eager unit test is not evidence of a live Docker judge or integrity worker lifecycle.
- Use service names, not container names, with Compose.
- Compose management commands such as `up`, `down`, `ps`, `logs`, and `config` run through the wrapper; application commands run through `exec -T`.
