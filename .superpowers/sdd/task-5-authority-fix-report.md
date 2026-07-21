# Task 5 Final Authority, Immutability, and Timeline Fix Report

## Status and scope

The final Task 5 Critical and three Important findings are fixed. The production change is limited
to the Backend canonical registry producer and integrity-service pure core. It does not change the
database schema, Worker API/controller, frontend, load/E2E, visual assets, plan, or ledger.

The direct-cutover registry contract changes from `2026-07-21.1` to `2026-07-21.2`. Every canonical
definition now emits required `origin: "browser" | "server"` data. Connectivity is `server`; all
other current definitions are `browser`. The worker registry schema requires this field with no
default, so an old or malformed snapshot fails closed during `Registry` construction. Definition
`schema_version` remains 1 because the event payload schemas did not change.

## Finding-by-finding TDD results

### Critical: one data-defined connectivity authority

RED:

- A direct reproduction showed a browser `connectivity_suspect` emitted `record`, opened an
  IncidentEngine timer, and later emitted `pause`, independently of ConnectivityMonitor.
- The focused forged-lifecycle test failed because the suspect action was `record`, not `audit`.
- Backend isolated registry tests were 1 passed / 2 failed: the producer still emitted version
  `.1` and no origin.

GREEN:

- Backend `EventDefinition.origin` is required in every frozen snapshot, versioned `.2`, with the
  connectivity definition explicitly server-owned.
- Worker `ParsedDefinition.origin` is required and validated as `browser` or `server`; removing all
  origins from the fixed snapshot now raises `ValidationError`.
- IncidentEngine uses the resolved definition's origin, not signal strings or incident family.
  Every browser claim for a server-owned triggered/escalated/restored phase is audit-only, has no
  incident ID, changes no incident state, and uses the disjoint command identity phase
  `external_server_<phase>_audit`.
- ConnectivityMonitor requires its resolved lifecycle definition to be server-owned and remains
  the only producer of actionable connectivity suspect/timeout/restore state.
- The test for forged suspect, timeout, and restore runs while a real device is observed. The
  suspect reuses the monitor's predictable UUIDv5 event ID; all forged commands remain audit-only,
  the monitor still emits canonical `record` then `pause`, and every command ID maps to exactly one
  identical command value.
- Focused worker authority/identity tests: 3 passed. Backend registry: 3 passed.

### Important: genuinely immutable JSON/registry/command values

RED:

- Six focused tests failed: normal `._data =` mutation succeeded, direct construction was shallow,
  non-string keys/custom objects/non-finite floats were accepted, and command values changed
  through the internal slot.

GREEN:

- `FrozenDict` stores data in a private write-once slot, overrides normal assignment/deletion, and
  recursively validates/freezes every construction path, including a prebuilt `FrozenDict`.
- Every mapping level requires exact string keys. Only finite JSON scalar values and dict/list/tuple
  containers are accepted.
- Commands re-freeze caller mappings and return fresh JSON projections. Direct slot assignment and
  deletion leave equality and `to_json()` replay unchanged.
- Parsed public metadata schemas are immutable. Each compiled validator receives a separate deep
  schema copy, so it does not share the resolved public schema object. Payload validation projects
  immutable admitted payloads to fresh JSON and remains replay-stable.
- Focused command + registry suite: 30 passed.

### Important: immutable sequencer admission snapshots

RED:

- The focused accept test failed because `new_records[0]` was the original mutable Pydantic model.
- The restore test failed because the stored identity had no immutable admitted record snapshot.

GREEN:

- New pure-core `AdmittedEventRecord` snapshots and revalidates every canonical EventRecord field,
  including recursively frozen payload and evidence descriptors.
- SessionSequencer snapshots each record during full-batch preflight, stores that snapshot beside
  its canonical identity, and returns only snapshots from `AcceptResult.new_records`.
- Restore uses the same snapshot/identity path. Existing transactional batch preflight, exact
  retry, content conflict, UUID reuse, cursor, and journal behavior are unchanged.
- `ReceivedEvent` rejects mutable wire EventRecord values and accepts only admitted snapshots.
  Mutation of the original batch after acceptance, or normal assignment/nested mutation against
  the admitted value, cannot change command identity, event type, timestamp, metadata, evidence,
  retry classification, or restored identity.
- Sequencer + incident focused suite: 31 passed.

### Important: durable total-order replay handoff

RED:

- The new timeline suite initially failed collection because no executable pure-core timeline
  contract existed. A later per-record delayed-delivery test also failed before that input was
  represented in the API.

GREEN:

- `core/timeline.py` defines JSON-projectable `TimelineBaseline`, `BatchReceiptEntry`, and
  `SubmissionEntry` values plus a `DecisionTimeline` pure composition owner.
- The baseline is durable `timeline_seq=0` with canonical sorted active/submitted participant sets.
  Receipt/submission entries require positive, gap-free run-local sequence numbers and
  nondecreasing authoritative server time.
- A receipt points to the already durable Task 4 batch, consumes only sequencer-admitted snapshots
  sorted by record sequence, and accepts an immutable set of delayed event IDs so mixed batches
  preserve exact ReceivedEvent decisions.
- Timeline suite: 7 passed, including baseline restoration, equal-time manual submit/escalation,
  scheduled end/timeout, multiple same-time receipts, post-input zero-grace, per-record delayed
  state, and live/replay command-value equality.

## Formal timeline order

For every durable input with `server_ms = T`:

1. Validate its exact next `timeline_seq`, nondecreasing time, immutable admitted records, and
   per-record delayed IDs before changing state.
2. Advance chronologically through every derived deadline at or before T. At one equal derived
   timestamp, apply scheduled-end auto-submit first, IncidentEngine deadlines second, and
   ConnectivityMonitor transitions third.
3. Apply the durable input. A submission marks the shared monotonic SubmissionState. A batch
   receipt calls ConnectivityMonitor.observe, then ingests admitted records in sequence order.
4. After a receipt, call IncidentEngine.tick(T), then ConnectivityMonitor.tick(T), so a lifecycle
   created with zero grace at T cannot wait for an unrelated future timer.
5. Equal-time durable inputs are applied strictly by `timeline_seq` and receive the same pre-input
   and post-input rules independently.

Consequences pinned by tests:

- An escalation already due at T is emitted before a manual submission entry at T.
- Scheduled-end auto-submit wins an equal-time tie with heartbeat timeout; the timeout is audit.
- Earlier connectivity thresholds are still emitted before a later scheduled end even when one
  coarse `advance_to()` crosses both times.
- Same-time receipts follow their durable sequence; a zero-grace trigger in one receipt advances
  before the next receipt.

## Task 6 consumption contract

Task 6 must:

1. Persist the initial baseline before starting decisions.
2. Persist the Task 4 batch and its receipt entry, or persist a submission entry, before calling
   `DecisionTimeline.apply`.
3. Allocate one gap-free `timeline_seq` per run under the same serialization owner used for live
   core calls. No decision engine, monitor, scheduler, or SubmissionState call may bypass it.
4. For a receipt replay, load the referenced journaled batch, pass it through SessionSequencer, and
   provide exactly `AcceptResult.new_records` plus delayed IDs derived from the same frozen policy.
5. On recovery, construct fresh engines with one shared SubmissionState, apply the baseline, replay
   every entry by `timeline_seq`, then call `advance_to` with the same authoritative target time.
6. Persist/dedupe canonical `IntegrityCommand.to_json()` values by command ID; a repeated ID with a
   different value remains a hard conflict.

No Task 6 filesystem, database, cache, network, controller, or worker runtime I/O is implemented by
this task.

## Verification

- Integrity-service Task 4 + 5 + timeline suite: 145 passed (final run).
- Integrity-service compileall: exit 0.
- Backend isolated registry suite: 3 passed.
- Backend isolated anti-cheat config API suite: 8 passed.
- Backend isolated integrity run lifecycle suite: 61 passed.
- `manage.py makemigrations --check --dry-run`: `No changes detected`.
- `manage.py check`: no issues (one pre-existing silenced check).
- `git diff --check`: exit 0.
- Pure-core forbidden import/I/O search: no matches.
- 100-column scan across all touched source/tests: no violations.
- `python3 -m ruff` was unavailable (`No module named ruff`); no package was installed.

The only test output is the pre-existing pytest-asyncio warning about unset
`asyncio_default_fixture_loop_scope`; these pure-core tests contain no async tests.

## Self-review and concerns

- The pure timeline now preserves mixed delayed/non-delayed records; this was added during
  self-review because a batch-level boolean would have weakened the existing ReceivedEvent
  contract during replay.
- The known review Minor remains: SessionSequencer retains full canonical event JSON for the run
  instead of a fixed-size digest. It was not part of the requested Critical/Important safety fix.
- Task 6 must still supply durable storage, outbox conflict enforcement, and one serialized live
  runtime owner. Calling the engines outside DecisionTimeline would violate the tested contract.
