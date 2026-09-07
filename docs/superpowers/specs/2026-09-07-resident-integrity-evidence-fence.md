# Resident evidence fence v1

Task 8c extends the resident path only. The default execution backend remains `legacy`; this is not deployment or activation approval.

## Wire and meaning

An ordinary immutable `health_snapshot` record may contain this typed payload extension:

```json
{"evidence_fence":{"version":"resident-evidence-fence-v1","attempt_id":"<trusted attempt UUID>","through_seq":42,"before_client_ms":123456}}
```

Run, participant, and device remain the batch identity. The gateway checks the attempt against its trusted upload scope and signs that attempt in the receipt envelope. `through_seq` must equal this health record's sequence, allocated in the same IndexedDB transaction. Changing any field after claim changes the canonical batch hash and is rejected; partial ACK/reload retries preserve the original whole batch.

A confirmed fence declares that media before `before_client_ms` is no longer eligible for **new** evidence demands under this versioned contract. It does not assert that arbitrary future late data is impossible. Raw event timestamps and original evidence anchors are never rewritten.

The scoped progress response adds `attempt_id`, `evidence_fence_version`, and `release_evidence_before_ms`. The gateway verifies the echoed scope; the browser requires the exact capability before using a positive release. Missing capability yields zero, unknown versions are rejected by intake (and ignored for browser release). Old signed requests/WAL receipts and unversioned browser behavior remain conservative and replay-compatible.

## Ordering proof

1. Capture the proposed clock boundary before awaiting anything. Rotate all current native recorders and await every already pending final callback, media write, and descriptor commit. Await sources already stopping as well. A replacement recorder starts after its predecessor finishes; its media starts after the captured boundary.
2. Join the emitter's serial write queue after that wait. Events admitted during the wait precede the snapshot; events admitted after joining follow it. Descriptor enumeration and health/fence append run in this queue. Mode/close checks prevent a post-submit fence. Neither answers nor accepted submission await the recorder barrier.
3. Subtract the maximum of the frozen registry's evidence-before lookback and the minimum local buffer (default 60 seconds). The release callback also protects the current minimum buffer. These are overlapping conservative bounds, not an additive mandatory 120-second buffer.
4. Durable receipt WAL includes the trusted attempt and immutable batch. The resident rebuilds fences in receipt replay order; only continuous **processed decision** coverage through the fence makes it eligible. Acceptance/ACK alone, a sequence gap, or processing lag cannot release it.
5. The resident caps release by original open-incident trigger-minus-lookback anchors and pending command evidence anchors of that attempt. The backend further caps it by that attempt's unresolved evidence delivery windows. The browser requires descriptor ACK, terminal/local upload state, and no retain protection before deletion.

Original-trigger event UUIDs resolve to durable original receipts and attempts for later escalations. New contract commands do not acquire the current batch's attempt. Historical unversioned command fingerprints replay byte-for-byte as before. Connectivity and platform-gap policy handling remain separate.

## Late facts and read model

A genuine event whose original evidence start precedes a confirmed fence remains a genuine policy input at its original timestamp. Derived command metadata carries `evidence_gap = {reason: "late_beyond_fence", before_client_ms, version}`. The backend persists it at `ExamEvent.metadata.integrity.evidence_gap`; evidence projection issues no impossible new window and reports unavailable evidence. Replay preserves the command identity. Fence/clock regression alone generates no misconduct command. Task 9 must render this persisted distinction rather than equating unavailable media with misconduct or complete evidence.

## Storage and failure bounds

Resident descriptors carry participant/attempt ownership. All resident descriptor reads, mutations, blob reads, release/deletion, and ACK marking enforce it. Old/unowned entries are preserved without relabeling, but still count toward the existing Run/device per-source byte and summed-duration caps (100 MB and 300 seconds by default). Missing described media is conservatively counted too. Exhaustion stops capture and reports local loss; it never deletes protected or foreign-owner data or blocks answers.

Before resident writers start, OPFS reconciliation enumerates only the current Run/device screen/webcam directories, with at most 10,000 entries per source and depth 8. Unknown files, size mismatch, enumeration failure, or bound exhaustion preserve files and disable the affected source with an explicit local storage gap. One orphan can disable that source until explicit recovery/cleanup. No automatic destructive cleanup is provided. This startup scan does not run concurrently with the normal bytes-before-descriptor write transient. IndexedDB fallback commits bytes and descriptors atomically.

These are retained-storage limits, not a hard bound on a browser encoder's pending native memory or a single unexpectedly oversized final chunk: capacity is checked after durable chunk storage, so the last chunk can overshoot and stops further capture. There is no browser-wide/cross-origin quota guarantee. Persistent local loss disables further fence/release for the route owner; retained data remains.

Replay provenance maps are linear in the existing admitted event history; pending fences are linear in admitted unclosed sequence gaps. No additional full batch store, queue framework, or periodic database fact rows are introduced. OPFS scans are bounded, while existing IndexedDB descriptor loading remains proportional to stored descriptor history.

## Verification limits

The deterministic long-run integration uses real IndexedDB storage/outbox and repository mapping with a healthy processed-fence HTTP fixture: 121 five-second 500,000-byte chunks (800 kbps), 605 seconds total, at least the latest minute retained, at most 7 MB retained in that scenario. Separate real resident-core tests process 121 fences over ten minutes. The 7 MB result is scenario-specific, not a capacity guarantee. Neither test is a real-browser encoder, deployed service, filesystem-crash, or multi-student capacity proof. Task 10 still owns rendered browser, real media timing, deployment, and load/failure verification; Task 9 owns teacher read-model presentation.
