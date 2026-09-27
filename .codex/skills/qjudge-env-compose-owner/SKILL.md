---
name: qjudge-env-compose-owner
description: Use when QJudge work involves Docker Compose environments, migrations, pytest, npm, Django management commands, Celery, service health, or container diagnostics.
---

# QJudge Env Compose Owner

## Environment choice

- `dev`: the only local environment. Interactive development, Storybook, and manual runtime inspection. It keeps its data: never add `-v` to `down`.
- CI: database-backed backend tests (GitHub service PostgreSQL) and the integration/E2E suites on a fresh install made by `ci/e2e-stack.sh`. There is no local test stack.
- Production: `deploy/qjudge init|check|ingress|upgrade|rollback|addon`. Use it only when the task explicitly targets a production-shaped install.

Use the repository wrapper for dev:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev <compose arguments>
```

Run commands that depend on databases, workers, or service configuration inside the owning dev service. Documentation, static checks, and service-independent tests may use an installed host runtime matching the project. No separate permission is needed for that choice.

Dev has no test database: the application role cannot create one. Run only database-free tests in dev (pytest-django rejects database access from unmarked tests); leave database-backed backend tests and E2E to CI unless the user asks for a local fresh-install run as described in `references/environment-matrix.md`.

## Common flow

1. Inspect status with `dev ps`.
2. Start only the required services, or use `dev up -d --build` for the complete environment.
3. Run non-interactive commands with `exec -T`.
4. Inspect the exact service logs and readiness endpoint when a command fails.

## Boundaries

- This skill owns Compose selection, service names, execution location, logs, health, and readiness.
- Use `qjudge-architecture-owner` for import/layer decisions.
- Use `qjudge-github-workflow-owner` for Git and PR policy.

Read `references/environment-matrix.md` before choosing a service or test command.
