---
name: qjudge-env-compose-owner
description: Use when QJudge work involves Docker Compose environments, migrations, pytest, npm, Django management commands, Celery, service health, or container diagnostics.
---

# QJudge Env Compose Owner

## Environment choice

- `dev`: interactive development, Storybook, and manual runtime inspection.
- `test`: automated backend/frontend/AI tests and isolated E2E dependencies.
- `main`: production-shaped local or deployment operations; use only when the task explicitly targets it.

Use the repository wrapper:

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh <main|dev|test> <compose arguments>
```

Run project commands inside the owning service. Do not run Django, pytest, or npm directly on the host unless the user explicitly requests a host-only diagnostic.

For tests, prefer the `test` environment. The development backend goes through development infrastructure such as PgBouncer and is not the canonical test runner.

## Common flow

1. Inspect status with `<env> ps`.
2. Start only the required services, or use `<env> up -d --build` for the complete environment.
3. Run non-interactive commands with `exec -T`.
4. Inspect the exact service logs and readiness endpoint when a command fails.

The wrapper accepts test aliases such as `backend`, `frontend`, and `celery`, but documentation uses actual service names such as `backend-test` to make the selected environment explicit.

The running `backend-test` service uses the least-privileged `qjudge_web` role and cannot create Django's temporary test database. For a pytest run, override only that process with the isolated test PostgreSQL administrator as documented in `references/environment-matrix.md`; do not grant `CREATEDB` to the application role.

## Boundaries

- This skill owns Compose selection, service names, execution location, logs, health, and readiness.
- Use `qjudge-architecture-owner` for import/layer decisions.
- Use `qjudge-github-workflow-owner` for Git and PR policy.

Read `references/environment-matrix.md` before choosing a service or test command.
