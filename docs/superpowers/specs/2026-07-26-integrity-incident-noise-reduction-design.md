# Integrity Incident Noise Reduction and Worker Recovery Design

**Date:** 2026-07-26

## Goal

Make the monitoring feed represent real semantic incidents instead of sensor edges or transport chunks, retain only incident-relevant evidence, and expose a narrow Worker restart action only when the current run is unhealthy.

## Confirmed product rules

- A browser sensor edge is not automatically a manager-facing incident.
- A recoverable condition becomes visible only after its registry grace period expires.
- Raw triggered/restored records remain available for audit, but the default manager feed shows escalated incidents and explicit exam operations only.
- Evidence remains local while an incident is inside its grace period. The client uploads it only after the Worker escalates the incident.
- Evidence is always selected from the registry-owned window, currently five seconds before through five seconds after the incident anchor.
- PostgreSQL records and R2 evidence have the same retention lifecycle as their contest. Stopping compute does not delete data; deleting the contest removes both database records and R2 objects.
- Teachers do not manually operate the normal Worker lifecycle. A restart action appears only for a running run whose health is unhealthy.

## Observed failure

For QStudent, incident `61804e5b-f301-5524-a3ae-2513e6616058` was triggered at `16:51:23.776` and restored at `16:51:24.693`, a duration of about 0.92 seconds. The manager UI nevertheless showed seven evidence items. Those seven items covered `16:51:01.719` through `16:51:26.713` and included chunks originally owned by a fullscreen incident and an earlier mouse incident.

Two independent defects produced this result:

1. Incident escalation compares checkpoint receipt times. A short client interruption that crosses two five-second checkpoints can therefore appear longer than its real duration.
2. Evidence summaries accept every chunk carrying an accumulated `incident_ids` alias without rechecking whether the chunk intersects the incident's retain window. Transport chunks are then presented as if they were separate pieces of semantic evidence.

## Event timing policy

The Worker remains the only policy authority. Browser hooks report monotonic state changes and client timestamps; they do not implement grace outcomes.

| Definition | Grace | Reason |
| --- | ---: | --- |
| `mouse_leave` | 5 s | Ignore boundary slips while recording deliberate absence. |
| `fullscreen_integrity` | 10 s | Fullscreen is required, but re-entry requires a user gesture. |
| `multi_display` | 20 s | Allow Screen Details API state and display changes to settle before escalation. |
| `screen_share` | 20 s | Give the student time to reopen the browser picker and select a source. |
| `webcam` | 20 s | Allow camera tracks to recover after a transient mute or device handoff. |
| `viewport` | 5 s | The sensor already has a 2–3 second visibility/keyboard settlement period. |
| `connectivity` | 30 s | This is server-observed absence, not a browser edge; tolerate short network changes. |
| `listener_integrity` | 0 s | A missing integrity listener has no meaningful recovery edge and pauses immediately. |
| `clipboard`, `forbidden_action`, exam lifecycle | 0 s | These are discrete operations, not duration-based states. |

For browser-origin incidents, a received restore uses `restore.client_occurred_at_ms - trigger.client_occurred_at_ms` to decide whether grace expired. Server receipt time is only the fallback for an incident that has not produced a restore. Invalid client chronology is rejected or handled conservatively; it is never allowed to turn a short, valid interval into a violation merely because delivery was delayed.

For server-origin connectivity incidents, the Worker continues to use its own clock. Exam completion closes connectivity tracking before later timeout evaluation so submission cannot generate a false `connectivity_timeout`.

## Browser sensor behavior

Every edge-based hook emits only on a real local state transition:

- normal to interrupted: one `triggered` signal;
- interrupted to normal: one `restored` signal;
- repeated DOM callbacks in the same state: no signal.

Mouse boundary detection additionally uses a 300 ms physical debounce before emitting the triggered signal. Existing pointer-idle and IME guards remain. Registry evidence policy is authoritative, so legacy `evidence_window_*` payload fields are removed from the mouse hook.

## Evidence retention and projection

Triggered incidents only protect the rolling local buffer. They do not create manifests or R2 uploads. When an incident escalates, the Worker sends one evidence-retain command containing the registry window. If the condition restores inside grace, the protected local data is released normally.

The backend may reuse one physical chunk across overlapping incident windows, but association and presentation are separate:

- storage identity remains recording session plus chunk sequence;
- summary candidates must both reference the incident and intersect one of its retain windows;
- candidates are deduplicated by chunk UUID;
- init chunks needed for decoding remain transport details and are not presented as standalone evidence counts;
- the event list shows only `有證據`; it never shows a raw chunk count such as `證據 7`;
- the detail view renders one chronological source track and places incident occurrence markers on that track.

No legacy evidence fallback is added. Old rows that do not satisfy the current incident-window contract are not projected as playable evidence.

## Manager-facing episodes

The backend owns display grouping. The frontend must not recreate incident semantics.

The default feed includes explicit exam activities and escalated integrity incidents. Triggered/restored-only incidents are omitted from the default feed but remain in the raw audit records.

Escalated incidents form one display episode when they have the same participant and incident family and the next occurrence starts no more than ten seconds after the prior occurrence restores. Raw incident IDs remain unchanged.

An episode provides:

- occurrence count;
- first and last occurrence timestamps;
- maximum and total interrupted duration;
- count of escalated occurrences;
- stable ordered occurrence rows, each retaining its incident ID;
- deduplicated evidence source availability.

The list card uses copy such as `滑鼠離開視窗 · 3 次` and displays `有證據` when any playable source exists. The detail panel lists each occurrence with its exact duration and shows markers above a single chronological evidence track.

## Worker restart

Normal start, stop, destroy, and purge controls are removed from the teacher-facing settings panel. Healthy runs show status only.

When `compute_state == running` and `health == unhealthy`, the panel shows one secondary action: `重新啟動 Worker`. The action requires a compact confirmation explaining that event uploads may retry briefly but retained contest data will not be deleted.

Restart preserves the run ID, token, data volume, policy snapshot, registry snapshot, PostgreSQL rows, and R2 objects. The controller:

- restarts a running/restarting container;
- starts an owned container in created/exited state;
- rejects an absent or ownership-mismatched container rather than silently creating a different run.

After restart, the backend reconciles container ID, name, URL, image digest, and token digest before setting health to healthy and clearing `last_error`. Failure leaves the run unhealthy and returns a stable recovery error. Rebuilding a deleted container is an operator repair workflow and is intentionally outside this action.

## Validation

- A 0.9 second and a 4.9 second mouse absence produce raw trigger/restore records but no violation card and no evidence upload.
- A 5.0 second or longer mouse absence produces one escalated incident and one bounded evidence track.
- Delivery of trigger and restore in different checkpoints does not alter the client-measured duration.
- Multiple DOM leave/enter callbacks in the same state do not create duplicate edges.
- Multiple qualifying mouse incidents within ten seconds render one episode whose details retain each occurrence.
- Evidence outside each occurrence's five-second retain window is excluded even when its metadata aliases the incident.
- A submitted exam cannot later produce a connectivity timeout.
- Healthy Worker status has no lifecycle action. Unhealthy running status exposes restart; restart preserves run data and restores healthy status only after reconciliation.

## Non-goals

- Recreating a missing Worker container from the teacher UI.
- Retaining an entire exam recording.
- Adding frontend-only incident grouping or legacy evidence playback fallback.
- Making grace periods configurable per contest in this version.
