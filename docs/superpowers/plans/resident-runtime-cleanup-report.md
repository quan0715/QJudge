# Resident runtime cleanup report

Completed in the shared checkout without commits, stash, resets, or changes to Compose/scripts. Existing changes were preserved. Ownership was limited to integrity-service plus this requested report.

## Removed

- WorkerRuntime.ingest, tick, begin_stop, stop, start_scheduler, stop_scheduler, scheduler loop, scheduler failure state, and unused clock injection.
- resident_mode runtime/client flags and the Bearer transport branch. BackendClient now uses Resident credentials exclusively; unused fetch_bootstrap was removed.
- The disabled DeadlineScheduler and its integration into DecisionTimeline. Scheduled-end submission is a backend concern; incident/connectivity decisions continue advancing in receipt order.
- Legacy receipt-context side log, append_advance, and fallback replay of unmatched raw journal batches. ReceiptStore is always the authoritative intake WAL.
- ArchiveManager, generation-based archive command transport, and its obsolete manifest builder. Resident lifecycle uses deterministic local gzip_segment plus immutable runtime archive_snapshot projections.
- Pre-contract command provenance replay branching. Escalations always retain the original event receipt. A retry cannot change its recorded attempt identity.

## Coverage preserved or migrated

- Engine tests now explicitly call accept_batch, process_pending, and outbox delivery. They verify that durable ACK precedes decisions/network delivery, plus journal/decision/outbox failure recovery, deterministic warnings, delayed-event auditing, immutable policy, participant isolation, constructor cleanup, and strict Backend response/retry behavior.
- Resident receipt tests preserve real os._exit crash recovery at receipt, ACK, decision, outbox and cursor boundaries; ordered replay, late-unverified disposition and evidence fences remain covered.
- Archive tests retain sealed-file/catalog corruption checks and command-outbox durability. Resident finalize tests now additionally verify retry behavior, manifest/content checksums, frozen snapshots, final device cursors, raw segment hash chains, and duplicate/reordered/conflicting checkpoints or missing segments blocking publication. The lifecycle now rejects duplicate/reordered checkpoint records explicitly.
- Tests exclusively exercising the retired scheduler or generation archive publishing were removed. Current resident scheduling/extension, finalization, blocked-delivery isolation and shutdown coverage remain in the resident suites.

## Verification

All commands ran inside the test Compose service using the supplied bind mount:

```sh
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test run --rm --no-deps -v /Users/quan/online_judge:/workspace:ro -w /workspace/integrity-service integrity-unit-test python -m pytest -o addopts='' -q -p no:cacheprovider tests/test_runtime_engine.py tests/test_resident_receipts.py
```

71 passed in 4.22s (first runtime/receipt migration).

```sh
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test run --rm --no-deps -v /Users/quan/online_judge:/workspace:ro -w /workspace/integrity-service integrity-unit-test python -m pytest -o addopts='' -q -p no:cacheprovider tests/test_runtime_engine.py tests/test_timeline.py tests/test_archive.py tests/test_resident_finalize.py tests/test_resident_lifecycle.py
```

117 passed in 2.73s (after scheduler/archive removal).

```sh
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test run --rm --no-deps -v /Users/quan/online_judge:/workspace:ro -w /workspace/integrity-service integrity-unit-test python -m pytest -o addopts='' -q -p no:cacheprovider tests/test_resident_finalize.py
```

14 passed in 5.02s (expanded resident archive coverage).

```sh
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test run --rm --no-deps -v /Users/quan/online_judge:/workspace:ro -w /workspace/integrity-service integrity-unit-test python -m pytest -o addopts='' -q -p no:cacheprovider
```

Final full integrity suite: **332 passed, 7 skipped, 2 warnings in 20.22s**. The skipped tests require host-rendered Compose JSON; Compose verification belongs to the main agent. Warnings are Starlette/httpx and AnyIO deprecations. Wrapper also reports pre-existing orphan containers; none were removed.

Focused git diff --check on all edited tracked runtime/core/archive/test files passed. Whole integrity-service diff --check reports one pre-existing trailing blank line in worker/bootstrap.py, which this subtask did not edit.

## Coordinated contract dependencies

- Per main-agent instruction, bootstrap generation/previous_manifest fields and related validation remain because backend bootstrap/archive retention contracts still emit/use them. They no longer select a runtime mode or archive transport.
- Per main-agent instruction, CommandOutbox's archive_uploads response validation and existing command schema literals remain until backend test_resident_service_archive_callback_retains_exact_object_scope and create_archive_upload handling are reconciled. Resident finalization itself no longer calls that command API.
- Backend passes attempt_id on every real checkpoint. Direct runtime/receipt APIs still allow omitted attempt_id for telemetry without evidence-fence scope; such progress never claims a fence. Receipt identity now strictly includes the optional attempt value. Making attempt_id mandatory throughout the internal API is a separate coordinated contract tightening, not a legacy fallback.
- Runtime public ingest/tick/stop/scheduler aliases and mode fallback no longer exist. Production network/end-to-end validation remains the main agent's responsibility.
