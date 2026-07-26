# Task 4 Re-review Edge-case Fix Report

## Status

- Status: GREEN.
- Commit: `fix(integrity): close recovery edge cases` (this report is included in that commit).
- Scope: only the Task 4 recovery, canonical journal encoding, `EventBatch` coverage validation,
  and focused tests.

## RED / GREEN evidence

- RED — `python3 -m pytest tests/test_journal.py -k 'invalid_short_framing_prefixes or
  noncanonical_payload or canonical_retry_after_rejected'` failed 8 tests: malformed short
  prefixes were truncated and valid-checksum noncanonical frames were accepted.
- RED — `python3 -m pytest tests/test_schemas.py -k extreme_sequence_span` failed with
  `OverflowError: Python int too large to convert to C ssize_t` from `list(range(...))`.
- GREEN — the same focused recovery command passed `8 passed`; the schema command passed
  `1 passed`.
- Final GREEN — `python3 -m pytest tests/test_schemas.py tests/test_sequencer.py
  tests/test_journal.py` passed `62 passed in 0.32s`.
- `python3 -m compileall -q integrity_service tests`, `git diff --check`, and the forbidden
  import search all exited successfully. Pytest emitted only the environment's existing
  `pytest-asyncio` loop-scope deprecation warning.

## Finding mapping

1. **Critical — malformed short framing must be preserved.** `_decode_at()` now validates all
   available header and digest bytes before calling the record incomplete. A truncated valid
   hexadecimal prefix remains recoverable; any invalid available byte produces
   `JournalCorruption` without a write.
2. **Important — recovered payload must be canonical bytes.** Shared
   `journal.encoding.encode_record()` is used by both writer and recovery, avoiding a circular
   import. After semantic validation, recovery compares the complete recovered frame against the
   canonical encoding and rejects every mismatch before it can reach the batch-id index.
3. **Important — finite exact sequence coverage.** `EventBatch.validate_range()` compares the
   arithmetic span against record count first, then checks each bounded record position. It never
   materializes an untrusted range.

## Exact preservation coverage

- Invalid short `b"G"` header and canonical header/separator plus invalid `b"G"` digest prefix,
  both standalone and after a valid frame, preserve bytes and raise `JournalCorruption`.
- Valid-checksum whitespace/unsorted JSON, alternate UTF-8 escaping, and duplicate-key frames
  preserve bytes and raise `JournalCorruption`.
- The retry regression proves no rejected noncanonical frame creates a conflicting identity index:
  once canonical bytes are present, the normal retry is recognized as the exact duplicate.
- The pre-existing incomplete-tail test now uses a genuinely canonical hexadecimal digest prefix;
  it remains truncatable as required by the stricter rule.

## Self-review

- The extracted encoder is journal-only and imports only `EventBatch`; recovery and writer depend
  on it, so no writer/recovery circular import is introduced.
- Canonical frame comparison also covers payload length, digest, separators, and newline, while
  retaining the prior typed corruption/truncation policy.
- No Worker/controller, schema/database, load/E2E, visual, plan, or ledger files changed.

## Concerns / intentionally deferred

- The re-review's Minor fixed-width payload length cap and direct `restore()` validation remain
  intentionally deferred per task scope.
- Ruff is unavailable in the supplied environment; line-length inspection, compileall, pytest,
  diff check, and import search were used instead.
