# Grade appeal MVP implementation

Approved source: https://chatgpt.com/space/page_e2fa7819ae8c81918ba1d7c33d18e8aa

Implement inline in the isolated `codex/grade-appeal-mvp` worktree. Existing dirty checkout is unrelated.

1. Add API behavior tests for open, duplicate open, four-message conversation, scoped privacy, unpublished results, closed writes and independent grading. Database-free route test runs locally; database-backed tests run in CI per repository environment policy.
2. Add GradeAppeal (one-to-one ExamAnswer, open/closed, closure actor/time) and GradeAppealMessage (author/content/time). Routes: list/create/retrieve/messages/close. Atomic first message, per-answer duplicate guard and per-ticket close/message locking. Reuse canonical score service and manager permissions.
3. Retire clarification runtime and retain its data model and database table until old data disposition is authorized (keeps Django cascade handling valid; no old API or UI remains). Keep announcements. Add a shared Carbon conversation dialog, student per-answer entry, and staff list in the existing communications area. All network operations use repositories. No deadlines, snapshots, assignment or notifications.
4. Verify frontend behavior, typecheck, affected quality gates, API manual flow in a separate dev service with this worktree source, and PostgreSQL backend tests via draft-PR CI. Record actual evidence and update the shared draft.

Review focus: untrusted answer/contest/message author; public visibility bypass; duplicate first message; send/close races; preserving drafts on failure; canceled publication hiding cached details; raw vs policy-adjusted score; old data preservation.

No production deployment or migration is included. Stop after reviewable implementation and verified results, leaving production data disposition explicit.
