# Anti-Cheat Exam Production Load Test

This load test simulates a monitored paper exam with stateful student users:

1. login
2. enter contest
3. start exam
4. record `exam_entered`
5. load questions
6. heartbeat
7. autosave answers
8. optionally trigger anchor-window WebP evidence upload
9. optionally trigger `screen_share_stopped` pre-loss WebP evidence upload
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

For local script validation with the seeded dev contest, run a dedicated
`mouse_leave` evidence bundle:

```bash
LOADTEST_RUN_ID=LOADTEST_LOCAL_$(date +%Y%m%d_%H%M) \
LOADTEST_CONTEST_ID=<local-seeded-contest-id> \
LOADTEST_USERS_CSV=loadtests/anticheat_exam/users.example.csv \
LOADTEST_SCENARIO=evidence_anchor \
LOADTEST_EVIDENCE_EVENT_TYPE=mouse_leave \
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

- `LOADTEST_SCENARIO=normal|evidence_anchor|stream_loss`: selects the load-test
  behavior. Use `normal` for answer throughput, `evidence_anchor` for WebP
  anchor-window evidence burst tests, and `stream_loss` for pre-loss evidence
  tests. Incident scenarios keep users alive with heartbeat after the startup
  evidence bundle and do not autosave answers.
- `LOADTEST_CALL_CONTEST_ENTER=true`: also call the contest enter endpoint before
  `exam/start`. Keep this off for local seeded paper exams that are already
  registered.
- `LOADTEST_FORCE_EVIDENCE_ON_START=true`: each student uploads one startup
  `mouse_leave` evidence bundle. Useful for smoke tests. This is ignored when
  `LOADTEST_ENABLE_MOUSE_LEAVE=false`.
- `LOADTEST_ENABLE_MOUSE_LEAVE=true`: enables the legacy mixed `mouse_leave`
  task in `normal` scenario. Keep this off for long answer-capacity runs and use
  `LOADTEST_SCENARIO=evidence_anchor` for dedicated WebP evidence testing.
- `LOADTEST_REQUEST_TIMEOUT_SECONDS=10`: caps each HTTP call from the load-test
  client and forces stale client-side connections to fail instead of freezing the
  Locust run.
- `LOADTEST_HEARTBEAT_INTERVAL_SECONDS=15`: sends deterministic per-student
  heartbeat refreshes; keep this below the backend heartbeat timeout.
- `LOADTEST_EVIDENCE_EVENT_TYPE=mouse_leave`: event type used by
  `LOADTEST_SCENARIO=evidence_anchor`.
- `LOADTEST_EVIDENCE_SOURCE_MODULE=screen_share`: source module used for
  evidence frames. Use `webcam` for webcam-specific stream-loss scenarios.
- `LOADTEST_EVIDENCE_EVENTS_PER_USER=1`: number of startup evidence bundles per
  student in incident scenarios.
- `LOADTEST_EVIDENCE_EVENT_SPACING_SECONDS=0`: optional delay between multiple
  evidence bundles from the same student.
- `LOADTEST_FRAME_COUNT=7`: normal anchor-window WebP frames per event.
- `LOADTEST_PRE_LOSS_FRAME_COUNT=6`: pre-loss WebP frames per stream-loss event.
- `LOADTEST_ENABLE_STREAM_LOSS=true`: enables `screen_share_stopped` pre-loss
  evidence. This can pause the participant by policy, so use it in a separate
  incident scenario instead of a long answer-autosave throughput run.
- `LOADTEST_ENABLE_SUBMIT=true`: submit exams when Locust users stop.

## Dedicated Evidence Runs

Run these separately from normal answer-capacity tests. Incident events can
change participant state by design, so the script keeps users alive with
heartbeat and avoids answer autosave after evidence upload.

Anchor-window WebP evidence burst, 130 students x 7 frames:

```bash
LOADTEST_RUN_ID=LOADTEST_20260503_2000_EVIDENCE \
LOADTEST_CONTEST_ID=<contest-id> \
LOADTEST_USERS_CSV=loadtests/anticheat_exam/users.production.csv \
LOADTEST_SCENARIO=evidence_anchor \
LOADTEST_EVIDENCE_EVENT_TYPE=mouse_leave \
LOADTEST_EVIDENCE_SOURCE_MODULE=screen_share \
LOADTEST_EVIDENCE_EVENTS_PER_USER=1 \
LOADTEST_FRAME_COUNT=7 \
locust -f loadtests/anticheat_exam/locustfile.py --host https://<production-host> \
  --headless --users 130 --spawn-rate 0.10 --run-time 10m \
  --html loadtests/anticheat_exam/reports/evidence-anchor-130.html
```

Stream-loss pre-loss evidence, 130 students x 6 frames:

```bash
LOADTEST_RUN_ID=LOADTEST_20260503_2030_STREAMLOSS \
LOADTEST_CONTEST_ID=<contest-id> \
LOADTEST_USERS_CSV=loadtests/anticheat_exam/users.production.csv \
LOADTEST_SCENARIO=stream_loss \
LOADTEST_EVIDENCE_SOURCE_MODULE=screen_share \
LOADTEST_PRE_LOSS_FRAME_COUNT=6 \
locust -f loadtests/anticheat_exam/locustfile.py --host https://<production-host> \
  --headless --users 130 --spawn-rate 0.10 --run-time 10m \
  --html loadtests/anticheat_exam/reports/stream-loss-130.html
```

For production, keep spawn rate below the login rate limit unless using
distributed workers from multiple source IPs.

## SFU Load Testing Scope

This Locust file can exercise the backend anti-cheat/event/evidence APIs, but it
does not create real WebRTC media tracks. A true SFU capacity test must run in a
browser-capable harness that creates `RTCPeerConnection` objects and publishes a
real or synthetic video track, then has admin subscribers join selected
publishers. Do not treat plain HTTP calls to `/exam/sfu/*` as proof of SFU media
capacity.

Recommended SFU test matrix:

- 130 student publishers using synthetic screen-share video tracks.
- Admin subscriber fanout at 1, 5, 10, and 20 concurrent monitored students.
- Track publish success rate, subscribe success rate, reconnects, and median/p95
  join latency.
- Backend broker API latency and Cloudflare upstream errors.

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
