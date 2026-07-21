# Task 5 Report: Registry-Driven Decision Engine

## Status

Complete. The integrity-service core now parses frozen registry snapshots and produces
deterministic, immutable incident, connectivity, and scheduled-end commands without any
Backend, Django, filesystem, database, cache, or network dependency.

## Changed files and commit

- `integrity-service/integrity_service/core/commands.py`
- `integrity-service/integrity_service/core/registry.py`
- `integrity-service/integrity_service/core/incidents.py`
- `integrity-service/integrity_service/core/connectivity.py`
- `integrity-service/integrity_service/core/scheduler.py`
- `integrity-service/tests/test_registry.py`
- `integrity-service/tests/test_incidents.py`
- `integrity-service/tests/test_connectivity.py`
- `integrity-service/tests/test_scheduler.py`
- `integrity-service/pyproject.toml`
- `.superpowers/sdd/task-5-report.md`

Scoped commit subject: `feat(integrity): add registry decision engine`. The final commit hash is
reported in the agent handoff because a commit cannot contain its own final hash.

`jsonschema` moved from the `worker` optional extra to base dependencies because registry parsing
is now used directly by the pure core. No package was installed globally.

## Explicit interface decision

The brief's sketch omitted the `run_id` required by deterministic command identity. The core API
therefore has no implicit, random, or zero run identity:

- `EngineContext(run_id: UUID)` is required by `IncidentEngine`, `ConnectivityMonitor`, and
  `DeadlineScheduler`.
- `ReceivedEvent` explicitly pairs a sequenced `EventRecord` with participant, device,
  authoritative server receipt time, and delayed-delivery status.
- Every `IntegrityCommand` includes its `run_id`, and every `command_id` is UUIDv5 over run ID,
  participant ID, device ID, event ID, and phase.
- Server-generated connectivity and scheduled-end events first derive deterministic event UUIDs.
  The scheduler uses the explicit reserved device identity `scheduler` rather than an absent or
  random device value.

This keeps Task 6 serialization inputs typed and UUID/JSON values stable.

## RED / GREEN evidence

Initial RED:

```text
python3 -m pytest tests/test_registry.py tests/test_incidents.py \
  tests/test_connectivity.py tests/test_scheduler.py
4 collection errors: core.registry and core.commands did not exist
```

Self-review RED:

```text
2 failed: nested command metadata was mutable; connectivity restore changed incident identity
```

Task 5 GREEN:

```text
20 passed in 0.14s
```

Task 4 + Task 5 GREEN:

```text
python3 -m pytest tests/test_schemas.py tests/test_sequencer.py tests/test_journal.py \
  tests/test_registry.py tests/test_incidents.py tests/test_connectivity.py \
  tests/test_scheduler.py
82 passed in 0.44s
```

Additional verification:

- `python3 -m compileall -q integrity_service tests`: passed.
- `git diff --check`: passed before staging; staged diff is checked again before commit.
- Forbidden import/I/O search across new core modules: no Django, Backend, FastAPI, HTTP,
  PostgreSQL, Redis, filesystem, subprocess, or socket references.

## Preserved invariants

- Registry structure and each definition's metadata schema are validated with `jsonschema`;
  event payloads are validated before decisions.
- Signal IDs are indexed from registry data in sorted definition/phase order; duplicates fail with
  a deterministic error. Incident decisions contain no event-type switch.
- Commands and their nested evidence/metadata are immutable. Identical replay yields identical
  values and UUIDv5 identities.
- Incidents are keyed by participant plus registry incident family. Duplicate triggers neither
  reopen nor postpone the deadline.
- Restore strictly before the grace deadline closes audit-only. At the exact deadline escalation
  is due, emitted once, and uses the registry's escalated signal and action.
- Delayed delivery never opens or changes actionable incident state. Submitted participants only
  produce audit actions from subsequent incident processing.
- Connectivity transitions use only server receipt deadlines. Each observed participant/device
  emits at most one suspect and one timeout until a later observation emits restore and resets the
  cycle. All three transitions share one deterministic incident identity.
- Scheduled end emits exactly one deterministic `auto_submit` per sorted active, unsubmitted
  participant. It exposes and emits no worker stop command.
- All state is in-memory inside the pure core; no tables, migrations, frontend, controller/worker
  API, or external I/O were added.

## Self-review

- Found and fixed deep mutability in frozen command values by recursively freezing nested JSON
  containers while retaining JSON-serializable dict/tuple shapes.
- Found and fixed connectivity restoration deriving a different incident ID from the new receipt;
  it now uses the degraded cycle's original server receipt identity.
- Confirmed escalation timestamps use the registry deadline rather than scheduler wake-up time,
  so command values remain stable when ticks occur after the boundary.
- Confirmed scheduler output ordering and idempotence, incident duplicate behavior, late/submitted
  audit behavior, metadata validation failures, duplicate registry signals, and replay equality
  through real behavior tests without mocks.

## Concerns

- The environment does not provide the optional `ruff` module, so `python3 -m ruff check ...`
  could not run. It was not installed globally. Compileall, pytest, diff checks, and import-boundary
  searches passed.
- Pytest reports the pre-existing `pytest-asyncio` deprecation warning about an unset
  `asyncio_default_fixture_loop_scope`; these Task 4/5 tests contain no async tests.
