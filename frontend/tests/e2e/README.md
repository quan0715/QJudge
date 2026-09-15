# Coding exam submissions E2E

`coding-submissions.e2e.spec.ts` logs in through the browser and starts a coding
exam. Fixture creation uses the teacher API; test-run and submission responses
are never mocked. The test verifies:

- Public sample execution returns the expected output without saving a submission.
- A student adds custom input and expected output through the UI, and the judge
  returns the matching output without saving a submission.
- Formal submission evaluates both public and hidden cases, earns AC / 100,
  appears in submission history, opens its detail, and survives a reload.

Each attempt creates its own classroom, contest and problem. Cleanup uses the
application's delete/archive APIs, including on failure.

## CI

The `coding-e2e` job in `ci.yml` calls `e2e-coding.yml` only for pull requests targeting main (within the CI path filters).
Dev pull requests and branch pushes skip this job. The existing manual workflow's `coding` group calls the same
workflow. Coding no longer runs `tag-management.e2e.spec.ts`, which tests tag API
permissions rather than student code execution.

The workflow first runs `auth.e2e.spec.ts` to verify login, registration, onboarding,
session persistence and logout. Coding submissions run only after authentication passes.
Both Playwright reports are retained separately.

This workflow sets `CELERY_TASK_ALWAYS_EAGER=false` and starts both worker queues
and the judge image. Default unit-test settings still use eager execution.
The workflow uploads the Playwright report, failure trace/video and service logs.

## Local run

From the repository root:

```bash
python3 scripts/bootstrap_integrity_secrets.py --secrets-dir .tmp/integrity-test-secrets

CELERY_TASK_ALWAYS_EAGER=false \
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test up -d \
  frontend-test celery-test celery-high-test judge-image-test

.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T \
  -e CI=true -e E2E_REUSE_ENV=true frontend-test \
  npm run test:e2e -- tests/e2e/coding-submissions.e2e.spec.ts --no-deps --retries=0
```

`--no-deps` skips the unrelated shared auth setup: this spec performs its own
student login and teacher fixture authentication. The test stack is retained
locally. GitHub Actions removes its isolated stack after the job.

On Apple Silicon, a native judge avoids amd64 emulation. Build it from the same
Dockerfile, then set these overrides on the Compose `up` command above:

```bash
docker build -t qjudge-coding-e2e-arm64:local -f backend/judge/Dockerfile.judge backend/judge
export DOCKER_IMAGE_JUDGE=qjudge-coding-e2e-arm64:local
export DOCKER_JUDGE_PLATFORM=linux/arm64
```

CI uses the default amd64 judge image on its Ubuntu runner.
