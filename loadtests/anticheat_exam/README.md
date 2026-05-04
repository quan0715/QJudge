# Anti-Cheat Exam Production Load Test

This load test simulates a monitored paper exam with stateful student users:

1. login
2. enter contest
3. start exam
4. record `exam_entered`
5. load questions
6. heartbeat
7. autosave answers
8. trigger `mouse_leave` evidence upload
9. optionally trigger `screen_share_stopped` pre-loss evidence upload
10. optionally submit on stop

It is designed for controlled production load testing with dedicated test users
and a dedicated load-test contest.

## Tool

Use Locust. This workstation already has Locust installed:

```bash
locust --version
```

## Required Data

Use a dedicated run id:

```bash
export LOADTEST_RUN_ID=LOADTEST_20260503_1900
```

Use a dedicated production test contest and users. Existing local seed data uses:

- users: `lt_001@test.com` ... `lt_200@test.com`
- password: `loadtest123`
- contest: printed by `python manage.py seed_loadtest_data`

For production, prefer creating a contest named with the run id, for example:

```text
LOADTEST_LOADTEST_20260503_1900_anticheat_exam
```

Prepare a CSV:

```csv
email,username,password
lt_001@test.com,lt_001,loadtest123
lt_002@test.com,lt_002,loadtest123
```

## Smoke Run

Run 5 users first:

```bash
LOADTEST_RUN_ID=LOADTEST_20260503_1900 \
LOADTEST_CONTEST_ID=<contest-id> \
LOADTEST_USERS_CSV=loadtests/anticheat_exam/users.production.csv \
locust -f loadtests/anticheat_exam/locustfile.py \
  --host https://<production-host> \
  --headless \
  --users 5 \
  --spawn-rate 1 \
  --run-time 5m \
  --html loadtests/anticheat_exam/reports/smoke.html
```

For local script validation with the seeded dev contest, force one startup
`mouse_leave` evidence bundle and keep stream-loss disabled so students continue
answering after the evidence upload:

```bash
LOADTEST_RUN_ID=LOADTEST_LOCAL_$(date +%Y%m%d_%H%M) \
LOADTEST_CONTEST_ID=<local-seeded-contest-id> \
LOADTEST_USERS_CSV=loadtests/anticheat_exam/users.example.csv \
LOADTEST_FORCE_EVIDENCE_ON_START=true \
LOADTEST_ENABLE_STREAM_LOSS=false \
locust -f loadtests/anticheat_exam/locustfile.py \
  --host http://localhost:8000 \
  --headless --users 2 --spawn-rate 2 --run-time 30s \
  --html loadtests/anticheat_exam/reports/local-smoke.html
```

## Staged Production Run

Run only when there is no real exam traffic.

```bash
# 30 users
LOADTEST_RUN_ID=LOADTEST_20260503_1900 LOADTEST_CONTEST_ID=<contest-id> \
LOADTEST_USERS_CSV=loadtests/anticheat_exam/users.production.csv \
locust -f loadtests/anticheat_exam/locustfile.py --host https://<production-host> \
  --headless --users 30 --spawn-rate 3 --run-time 10m \
  --html loadtests/anticheat_exam/reports/30-users.html

# 80 users
LOADTEST_RUN_ID=LOADTEST_20260503_1900 LOADTEST_CONTEST_ID=<contest-id> \
LOADTEST_USERS_CSV=loadtests/anticheat_exam/users.production.csv \
locust -f loadtests/anticheat_exam/locustfile.py --host https://<production-host> \
  --headless --users 80 --spawn-rate 5 --run-time 15m \
  --html loadtests/anticheat_exam/reports/80-users.html

# 130 users
LOADTEST_RUN_ID=LOADTEST_20260503_1900 LOADTEST_CONTEST_ID=<contest-id> \
LOADTEST_USERS_CSV=loadtests/anticheat_exam/users.production.csv \
locust -f loadtests/anticheat_exam/locustfile.py --host https://<production-host> \
  --headless --users 130 --spawn-rate 10 --run-time 30m \
  --html loadtests/anticheat_exam/reports/130-users.html
```

## Optional Admin Monitoring User

Add one admin reviewer user that loads incident/admin endpoints:

```bash
LOADTEST_ENABLE_ADMIN=true \
LOADTEST_ADMIN_EMAIL=loadtest_teacher@test.com \
LOADTEST_ADMIN_PASSWORD=<password>
```

This adds one fixed Locust user, so a `--users 131` run gives 130 students plus
one admin reviewer.

## Scenario Flags

- `LOADTEST_CALL_CONTEST_ENTER=true`: also call the contest enter endpoint before
  `exam/start`. Keep this off for local seeded paper exams that are already
  registered.
- `LOADTEST_FORCE_EVIDENCE_ON_START=true`: each student uploads one startup
  `mouse_leave` evidence bundle. Useful for smoke tests. This is ignored when
  `LOADTEST_ENABLE_MOUSE_LEAVE=false`.
- `LOADTEST_ENABLE_MOUSE_LEAVE=false`: disables the penalized `mouse_leave`
  scenario so long normal-capacity runs keep participants in progress.
- `LOADTEST_REQUEST_TIMEOUT_SECONDS=10`: caps each HTTP call from the load-test
  client and forces stale client-side connections to fail instead of freezing the
  Locust run.
- `LOADTEST_HEARTBEAT_INTERVAL_SECONDS=15`: sends deterministic per-student
  heartbeat refreshes; keep this below the backend heartbeat timeout.
- `LOADTEST_ENABLE_STREAM_LOSS=true`: enables `screen_share_stopped` pre-loss
  evidence. This can pause the participant by policy, so use it in a separate
  incident scenario instead of a long answer-autosave throughput run.
- `LOADTEST_ENABLE_SUBMIT=true`: submit exams when Locust users stop.

## Abort Rules

The script stops the run on any HTTP 5xx by default. Disable only for local
debugging:

```bash
LOADTEST_ABORT_ON_5XX=false
```

Operational abort thresholds:

- API 5xx > 1% for 1 minute
- p95 API latency > 3s for 3 minutes
- DB connections > 85%
- DB CPU > 85% for 3 minutes
- R2/S3 PUT or HEAD errors > 1%
- admin pages fail to load
- any real production user impact

## Cleanup

Dry-run first:

```bash
python manage.py cleanup_anticheat_loadtest \
  --run-id LOADTEST_20260503_1900 \
  --contest-id <contest-id>
```

Execute cleanup:

```bash
python manage.py cleanup_anticheat_loadtest \
  --run-id LOADTEST_20260503_1900 \
  --contest-id <contest-id> \
  --delete-users \
  --user-prefix lt_ \
  --confirm
```

The cleanup command keeps `lt_teacher` and `loadtest_teacher` by default when
deleting users by prefix.

By default, `--contest-id` is used to scope runtime rows, but the command deletes
the contest itself only when the contest name starts with `LOADTEST_` and contains
the run id. This prevents accidental deletion of a real contest. If you must
delete a nonstandard test contest name, add `--allow-non-loadtest-contest`.

If you want to keep the contest and delete only runtime rows:

```bash
python manage.py cleanup_anticheat_loadtest \
  --run-id LOADTEST_20260503_1900 \
  --contest-id <contest-id> \
  --keep-contests \
  --confirm
```

The cleanup command deletes object storage keys before deleting database rows,
deletes load-test answers/submissions, resets participant exam state, and clears
exam active-session/heartbeat/JTI cache keys. Do not clean only the database, or
R2/S3 will retain orphan evidence frames.
