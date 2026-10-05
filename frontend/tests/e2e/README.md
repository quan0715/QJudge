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
application's delete APIs, including on failure.

## CI

`e2e.yml` runs every Playwright group (auth, exam, contest, coding) on each pull request targeting main (no path
filter) and on manual dispatch; its `coding` group calls `e2e-coding.yml`. Dev pull requests and branch pushes do not run E2E. Coding no longer runs `tag-management.e2e.spec.ts`, which tests tag API
permissions rather than student code execution.

Authentication runs in the auth group. The coding scenario performs its own login.
The exam group includes `resident-integrity.e2e.spec.ts` for checkpoint delivery and recovery.

The workflow installs a fresh stack with `ci/e2e-stack.sh` (`deploy/qjudge init`
+ `upgrade`, then `ci/compose.e2e.yml`: test settings, non-eager Celery with both
worker queues and the judge image) and runs Playwright on the runner against
`http://localhost:8080`. Default unit-test settings still use eager execution.
The workflow uploads the Playwright report, failure trace/video and service logs.

## Local run

Install the stack in a separate worktree with its own Compose project and
storage (see the `--set` arguments in `ci/e2e-stack.sh`); the script prints the
Compose command for the installed stack. Then, from `frontend/`:

```bash
npx playwright install chromium
CI=true npm run test:e2e -- tests/e2e/coding-submissions.e2e.spec.ts --no-deps --retries=0
```

`--no-deps` skips the unrelated shared auth setup: this spec performs its own
student login and teacher fixture authentication.

The published judge image is amd64 only; on Apple Silicon `deploy/qjudge upgrade`
builds `oj-judge:latest` natively from `backend/judge/Dockerfile.judge`.
