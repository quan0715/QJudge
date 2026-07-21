# Task 5 Safety Fix Report

## Status and scope

All Task 5 review Critical and Important findings are fixed in the pure integrity-service core.
The change also pins the directly related UUID/complete-command and dynamic scheduler membership
Minor findings. It adds no Django, Backend, filesystem, database, cache, network, frontend,
worker API, controller, load/E2E, visual, table, or migration work.

Changed production scope:

- `integrity-service/integrity_service/core/commands.py`
- `integrity-service/integrity_service/core/registry.py`
- `integrity-service/integrity_service/core/sequencer.py`
- `integrity-service/integrity_service/core/incidents.py`
- `integrity-service/integrity_service/core/connectivity.py`
- `integrity-service/integrity_service/core/scheduler.py`
- `integrity-service/pyproject.toml`

Tests were added or extended only under `integrity-service/tests`. This report is also in scope.

## Finding-by-finding mapping

### Critical

1. **External escalated signals:** `IncidentEngine.ingest` now treats every externally received
   registry `escalated` phase as `action="audit"` with the identity phase
   `external_escalated_audit`. It never opens, escalates, consumes, or replaces a timer incident.
   Only `_escalate` from an existing triggered incident at/after its deadline can apply the
   registry action, and it uses the immutable canonical trigger snapshot. Tests cover no trigger,
   before/after deadline, trigger UUID reuse, delayed delivery, submission, and timer replay.
2. **Schema retrieval:** registry construction recursively rejects `$ref`, `$dynamicRef`, and
   legacy `$recursiveRef` values that are not local `#` fragments before validator compilation.
   Snapshot and payload validation are pinned to `Draft202012Validator`; every metadata validator
   is compiled once with an explicit `referencing.Registry` whose retriever always fails. HTTP and
   file references are rejected with a patched `urlopen` proving zero retrieval, while local
   `$defs` validation works. `referencing` is now a direct base dependency.
3. **Event UUID uniqueness:** `SessionSequencer` keys state by run, participant, and device; stores
   canonical JSON content per sequence; and maintains a reverse event-ID-to-sequence index.
   Complete batches are validated transactionally before any record is admitted. A UUID at another
   sequence always conflicts, same sequence/UUID with changed content conflicts, and an exact retry
   remains a duplicate with no `new_records`. Recovery now requires the run ID and full
   `EventRecord`, so it enforces the same identity/content rule. Lifecycle and non-lifecycle tests
   demonstrate that values which would alias one command ID never reach decisions.

### Important

1. **Connectivity receipt advancement:** `observe(server_ms)` first advances all due transitions
   for every tracked device through that authoritative time, globally ordered by transition time,
   phase, participant, and device. It then restores/resets the observed device. Exact suspect and
   timeout boundaries, duplicate ticks, and equal output with/without intermediary ticks are pinned.
2. **Shared submitted state:** `SubmissionState` is one monotonic run-local owner and is a required
   constructor dependency of `IncidentEngine`, `ConnectivityMonitor`, and `DeadlineScheduler`.
   Every exposed `mark_submitted` delegates to it; scheduler emission also marks it. Tests mark via
   each engine and cover submission before/between/after connectivity transitions and two devices.
3. **Participant/family connectivity incident:** transition state remains per device, while incident
   state is keyed by participant plus the registry family. Overlapping devices share one incident;
   the first suspect opens it, only the first timeout can apply the participant action, partial
   restore keeps it open, and final restore closes it.
4. **Deep-frozen registry:** signal and validator indexes are private read-only mapping proxies;
   parsed schemas use transitively immutable mappings/tuples; evidence is tuple/scalar data; and
   compiled validators are private frozen holders. Source/index/schema mutation attempts cannot
   change later resolve or validation results.
5. **Immutable open trigger:** `_OpenIncident` retains no `ReceivedEvent` or `EventRecord`. It stores
   only UUID/scalar fields plus deeply frozen metadata and the immutable parsed definition. Caller
   mutation after ingest cannot change later escalation identity, time, payload, or evidence.
6. **Engine context identity:** `EngineContext.__post_init__` rejects strings, `None`, and the zero
   UUID; only a real nonzero `UUID` can namespace commands.
7. **Command JSON contract:** command evidence/metadata accept only JSON primitives and
   dict/list/tuple containers, recursively convert containers to immutable mappings/tuples, require
   string object keys, and reject sets, custom objects, and non-finite floats. `to_json()` returns a
   fresh complete projection with UUID strings and tuple-to-list conversion, so callers receive no
   mutable internal reference. Deep mutation, invalid values, replay equality, JSON round-trip, and
   prebuilt immutable-mapping bypass tests are covered.

### Directly related Minors

- Table-driven tests independently recompute the exact UUIDv5 name formula and compare every field
  in trigger, duplicate trigger, escalation, restore, connectivity suspect/timeout/restore, and
  scheduled auto-submit projections. Restore before/exactly at/after deadline is pinned.
- Scheduler tests cover post-deadline add, remove, re-add, later membership, explicit submission,
  and no repeat emission.

## Interface decisions

- `SubmissionState` must be created once per run and supplied to all three engines. Optional or
  engine-private submission sets were deliberately removed because they cannot preserve monotonic
  cross-engine action eligibility.
- `SessionSequencer.restore` is now
  `restore(run_id, participant_id, device_id, record)`. Recovery must provide the full journaled
  record rather than only sequence/UUID so the same canonical-content invariant applies on replay.
- External escalated audit commands keep their received event type and receipt data but use the
  distinct identity phase `external_escalated_audit`; canonical timer escalation retains
  `escalated` and the trigger event UUID.
- `IntegrityCommand.to_json()` is the sole command-level projection intended for Task 6 envelopes.

## TDD evidence

Focused REDs were observed before production changes:

```text
python3 -m pytest tests/test_commands.py tests/test_registry.py tests/test_sequencer.py -q
20 failed: UUID/JSON freeze, nonlocal refs/deep registry freeze, UUID/content sequencing.

python3 -m pytest tests/test_incidents.py tests/test_connectivity.py tests/test_scheduler.py -q
32 failed: required shared-state constructors and all dependent engine behavior were absent.

python3 -m pytest \
  tests/test_commands.py::test_command_refreezes_prebuilt_mapping_without_retaining_constructor_input -q
1 failed: prebuilt FrozenDict retained nested constructor input.
```

Focused GREEN checkpoints were 30 passed, then 32 passed, then the mapping-bypass regression passed.

Fresh final Task 4 + Task 5 verification:

```text
python3 -m pytest -o addopts='' tests/test_schemas.py tests/test_sequencer.py \
  tests/test_journal.py tests/test_commands.py tests/test_registry.py tests/test_incidents.py \
  tests/test_connectivity.py tests/test_scheduler.py
collected 128 items
128 passed in 0.37s

python3 -m compileall -q integrity_service tests
exit 0

git diff --check
exit 0
```

The core forbidden import/I/O search returned no match for Django, FastAPI, HTTP clients, URL/file
openers, sockets, subprocesses, Redis, PostgreSQL/SQLite, OS, or pathlib I/O. A 100-column scan also
returned no violations. `python3 -m ruff` could not run because the environment has no `ruff`
module; no global package was installed.

## Task 6 durable replay contract

Task 6 must durable-journal the authoritative `received_at_server_ms` and a deterministic,
ordered submission-state timeline **before** decisions are applied, then replay both in their
original order before reconstructing or emitting commands. `EventBatch` alone does not contain the
server receipt timestamp or submission transitions, so replaying only `EventBatch` records cannot
reproduce incident deadlines, connectivity gap transitions, submission action eligibility, or
their UUID/command values. Task 6 must also call `SessionSequencer` before any decision engine and
must supply the same `SubmissionState` instance to all three engines.

## Self-review and concerns

- Self-review found and fixed a second-order deep-freeze bypass where a manually constructed
  `FrozenDict` could retain mutable constructor input; command construction now re-freezes it.
- Connectivity ordering is based only on authoritative server receipt/tick times and fixed sort
  keys. Task 6 must replay receipt/submission entries in that same durable order; concurrent arrival
  order cannot be reconstructed from browser timestamps.
- The only remaining test output is the pre-existing `pytest-asyncio` warning for unset
  `asyncio_default_fixture_loop_scope`; these core tests contain no async tests.
