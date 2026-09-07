# Resident finalization and retained state

Implemented Task 8b contract. Deployment, browser/load verification, Task 8c evidence fences and Task 9 presentation remain separate. Legacy execution remains the default and uses its existing lifecycle.

## Control and revision authority

- Backend reconciliation sends a signed `POST /v1/runs/{run_id}/control/finalize` body `{"expected_revision": N}` only for a draining Run whose grace deadline has passed. The existing signature binds method, exact path/body, Run, revision and timestamp under `resident-v1`.
- The endpoint returns `202` for **admission**, not completion. A no-queue archive pool defaults to one worker and excludes duplicate work for the same Run. Receipt, control, decision and delivery resources remain separate. Capacity returns `503` with retry guidance.
- Resident calls `POST /api/v1/internal/integrity/runs/{run_id}/finalize/` with its independently rotatable `Resident` service credential. Phases are `authorize`, `segment_upload`, `upload`, and `commit`. Authorization requires matching Contest and Run revisions, `draining/open`, and both latest exam end and Run grace expiration. It persists one UUID candidate for that revision in `Run.metrics.finalization`.
- `segment_upload`, `upload`, and `commit` carry `revision`, `candidate_id`, SHA-256, byte length and bounded queue-gap counters. They revalidate scope. Presigning, object upload and object HEAD do not hold Contest/Run/Participant row locks, registry locks or runtime intake locks. HEAD uses a presigned internal object URL with checksum mode enabled, one-second connect and two-second read timeout, and no HTTP retries.
- Commit checks size/checksum outside its transaction, then reacquires Contest → Run and rechecks revision, lifecycle and candidate. An extension committed before that CAS wins. A previously committed archive cannot reopen. Losing uploads have no authority to publish or overwrite the winner. Legacy `publish_archive_manifest` callbacks are rejected for resident Runs.
- A newer authenticated descriptor cancels old local drain work and restores intake when the runtime is healthy. A stale backend rejection by itself does not invent a replacement schedule. Backend PATCH/answers never wait for resident availability.

## Archive keys and completion

- Sealed raw data: `runs/{run_id}/resident-segments/{compressed_sha256}.journal.gz`.
- Candidate manifest: `runs/{run_id}/resident-revision-{revision}/{candidate_uuid}/{manifest_sha256}.json`.
- Both namespaces are content-addressed. Equal retries use the same bytes/key; changed content uses another key. Successful raw uploads are checkpointed locally in `resident-archive.log` and reused across retries/revisions. Old candidate objects are retained; this implementation performs no orphan deletion or storage purge.
- Manifest schema version `2` contains Run/revision/candidate identity, frozen policy/registry snapshots and digests, raw segment keys/digests/hash chain/counts, final device cursors, resident queue-gap counts and an explicit recovery-retention declaration. It is not a complete off-host recovery bundle.
- Normal receipt rotation bounds raw segments at the configured threshold (default 8 MiB) plus one admitted batch. Compression/upload occurs only in the archive lane. Segments over 16 MiB, including historical oversized active segments, remain local and fail finalization visibly. Candidate manifests and upload requests are capped at 16 MiB.
- Finalize stops new intake after current authorization, then yields to bounded maintenance until all durable receipts are processed. It does not delete or skip pending receipt decisions. After grace expiration, pending commands/evidence can be recorded as explicit deadline gaps. Pending commands remain in the retained outbox; `pending_commands` is the snapshot count, which may conservatively include an in-flight delivery that subsequently finishes.
- Archive PUT/HEAD failures leave `data_state=open` and the candidate retryable. A lost commit response is repaired by the resident's bounded archive retry every ten seconds, even when backend reconciliation no longer lists the already archived Run. A restart loads only backend-authorized live descriptors, so archived local history does not consume active slots.
- Successful publication is checkpointed as a terminal descriptor before resource closure. Closure waits for admitted command delivery without holding intake/global locks, closes stores/clients, and reclaims the registry slot and lock once old lock users finish. Shutdown closes resources only and does not request finalization of ongoing exams.

## Required retention and forensic location

The resident persistent volume remains necessary after successful publication. Under `{INTEGRITY_RESIDENT_DATA_ROOT}/{run_id}/`, retain all of:

- `receipts/`: authoritative original batch/time/ordinal/disposition WAL and processed cursor;
- `timeline/`: original decision ordering, service gaps and receipt context;
- `outbox/`: pending/delivered commands, original identities and suppression dispositions;
- `journal/`, `archive/`, `resident-archive.log`, and `descriptor.log`: raw projections, compressed segments, upload checkpoints and terminal identity.

The manifest supplies this relative Run location; backend `archive_manifest_key` and `archive_manifest_sha256` identify its authoritative publication. Backend admission ownership (`IntegrityBatchAdmission`), upload grants, normalized events, evidence records and `Run.metrics` are also retained. No ACK, final marker, terminal slot reclamation or process shutdown deletes them. Purging the volume would lose authoritative forensic/recovery state even though the raw archive remains in object storage.

Slot reclamation does not reclaim disk. Local histories, orphan candidates and backend ownership/history require a separately designed retention/backup/purge policy; none is implemented here. Per-Run admission budgets and finite lanes do not constitute a measured total-volume or deployment capacity guarantee.

## Observed outages and delayed command protection

Actual gateway transport failures and unavailable/capacity responses (`404/429/502/503/504/507`) persist a backend `service_outage` marker. Reconciler transport/HTTP availability failures also report it. Authentication or payload rejection (`401/422`) does not create a platform gap; an explicitly unhealthy but reachable maintenance response is not itself proof of a network outage.

The marker has monotonically increasing `generation`, `started_ms`, a frozen handoff `ended_ms`, and `reason=platform_unavailable`. Signed batch envelopes and descriptor PUTs can add `service_gap` with those fields. Resident fsyncs that generation in its timeline before resumed receipt admission/decision work and returns `X-QJudge-Gap-Generation`. Duplicate/older generations do not append new gaps, including after recovery. Backend compares the acknowledged generation before clearing, so a concurrent newer failure survives. ACK retains the interval in `observed_service_gaps` for delayed-command enforcement; it does not erase history.

A batch may already be in flight when an outage is first observed. The existing backend command-application transaction therefore also checks retained pending/acknowledged intervals before any effects. Only `connectivity_suspect`/`connectivity_timeout`, actions `record/pause/lock/submit`, and `timing_basis=server_receipt` are eligible. Its silence interval must overlap: transition strictly after gap start and last receipt strictly before gap end. A currently unacknowledged open interval ends at the current backend observation time for this check. A zero-duration interval covers nothing.

Those effects become audit events with `suppressed_reason=platform_gap`, original requested action, command ID and fingerprint. The separately cached backend suppression count increments once. Previously committed command identities retain their original disposition; genuine unrelated violations, later healthy silence and backend exam deadlines retain their behavior. Undetected outages or decisions already applied before observation are not retroactively reclassified.

Observed backend interval history and resident timeline gaps are each capped at 10,000. Exhaustion retains history/current marker and refuses further handoff acknowledgment or resident gap admission. It does not silently forget intervals. The backend JSON history incurs O(history) rewrite/read cost on an observed interval or guard lookup; normal no-outage polling does not append history. Answer/capture authorization does not depend on these health counters.

Old resident binaries do not implement the gap-generation acknowledgment or manifest schema 2. A signed gap batch is not safe to downgrade to a pre-handoff binary. Do not roll back an in-progress resident Run to legacy or delete its volume; changing the default backend affects new Run ownership only.

## Task 9 read model and Task 8c handoff

Background health persistence merges `metrics.service_gaps` under a revision/state/updated-at guard. Its fields are resident `count`, `last_ended_ms`, `suppressed_connectivity_commands`, and actual observed `affected_participant_count`. Last gap end is not heartbeat time. Backend in-flight protection has a separate `metrics.backend_suppressed_connectivity_commands`; it must not be mislabeled as resident suppression or all students affected.

`metrics.finalization` stores candidate/status, retention declarations and final `gaps`: missing final markers and incomplete upload-grant scopes; nonterminal evidence chunks; pending retain/evidence demands; and participant counts lacking receipts/upload grants. Participant counts use exam status `in_progress/paused/locked/submitted`, excluding registered `not_started` absentees. Grant counters describe persisted attempt/device scopes, not unique people. Queue counts come from the resident freeze snapshot. These overlapping categories must not be summed into a count of affected students, and `archived` does not mean complete evidence. Grant completion is never fabricated by archive commit.

Task 8c must still provide an explicit active evidence fence/watermark. Current resident release remains conservative; this change does not solve the existing bounded browser media capacity limit or claim long-exam browser readiness. Task 10 must verify storage checksum support, internal URL reachability, actual process/browser recovery, media load, persistent-volume retention and operational capacity.
