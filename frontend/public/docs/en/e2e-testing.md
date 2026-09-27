E2E and API integration tests run in CI against a QJudge instance built from scratch with the regular install flow. Playwright and Vitest run directly on the runner and talk to the frontend at `http://localhost:8080`.

## Where CI Runs Them

| Workflow | When | What |
| --- | --- | --- |
| Integration Tests in `ci.yml` | Every CI run | `npm run test:api` and the MCP Server integration tests |
| `e2e-coding.yml` | Pull requests targeting `main` | The login flow, then coding exam submissions |
| `e2e-manual.yml` | Manual dispatch in GitHub Actions | One group (auth, exam, contest, coding, settings) or all, with an optional grep |

Every job starts with `ci/e2e-stack.sh`:

1. `deploy/qjudge init --non-interactive` with origin `http://localhost:8080`, bundled storage and public storage URL `http://minio:9000` (the runner maps `minio` to `127.0.0.1` in `/etc/hosts`).
2. `deploy/qjudge addon storage up` and `init`, then `deploy/qjudge upgrade` installs the current commit.
3. Restart with `ci/compose.e2e.yml` layered on top: Django uses `config.settings.test`, Celery runs asynchronously, and the AI services talk to fake adapters.
4. `seed_e2e_data` creates the `admin`, `teacher`, `student` and `student2` accounts plus sample problems and contests; the test credentials are in `frontend/tests/helpers/data.helper.ts`.

The script stores the compose command for the stack in `$QJ_DC`; CI uses it to collect service logs and upload them as artifacts.

## Running Locally

When you need a local run, use the same script in a separate git worktree and Compose project so that your checkout's `deploy/.env` and the dev data stay untouched:

```bash
git worktree add --detach ../qjudge-e2e HEAD
../qjudge-e2e/ci/e2e-stack.sh --set COMPOSE_PROJECT_NAME=qjudge-e2e
```

- Extra `--set KEY=VALUE` arguments go to `deploy/qjudge init` and override the script defaults.
- Bundled storage uses ports `9000`/`9001`, which the dev MinIO also uses: run `qjudge-dc.sh dev stop` first, or pass `--set STORAGE_MODE=external` and the other `OBJECT_STORAGE_*` keys to use another S3-compatible service (the bucket must exist and its CORS must allow `http://localhost:8080`).
- With bundled storage the browser must resolve `minio`: add `127.0.0.1 minio` to `/etc/hosts`.

The script ends by printing the compose command for the stack, which you can use to read logs. Then run the tests from the worktree's `frontend/`:

```bash
cd ../qjudge-e2e/frontend
npm ci
npx playwright install chromium
npm run test:e2e -- tests/e2e/auth.e2e.spec.ts
npm run test:api
```

`npm run test:e2e:ui`, `test:e2e:debug` and `test:e2e:report` help with debugging. Override the target URLs with `PLAYWRIGHT_BASE_URL` and `API_BASE_URL`.

Clean up only this project afterwards (never use `-v` on dev):

```bash
docker compose -p qjudge-e2e down -v
docker compose -p qjudge-e2e-storage down -v
git worktree remove --force ../qjudge-e2e
```

The `qjudge/*:sha-*` images built by `upgrade` stay on the machine; remove them with `docker image rm` when you no longer need them.

## Writing Tests

Tests live in `frontend/tests/e2e/`; shared login, data and exam helpers live in `frontend/tests/helpers/`. New tests should create the classrooms, problems and exams they need and clean them up afterwards instead of depending on data left by other tests.
