# Grade appeal MVP implementation

Approved source: https://chatgpt.com/space/page_e2fa7819ae8c81918ba1d7c33d18e8aa

Implement inline in the isolated `codex/grade-appeal-mvp` worktree. Existing dirty checkout is unrelated.

1. Add API behavior tests for open, duplicate open, four-message conversation, scoped privacy, unpublished results, closed writes and independent grading. Database-free route test runs locally; database-backed tests run in CI per repository environment policy.
2. Add GradeAppeal (one-to-one ExamAnswer, open/closed, closure actor/time) and GradeAppealMessage (author/content/time). Routes: list/create/retrieve/messages/close. Atomic first message, per-answer duplicate guard and per-ticket close/message locking. Reuse canonical score service and manager permissions.
3. Retire clarification runtime and retain its data model and database table until old data disposition is authorized (keeps Django cascade handling valid; no old API or UI remains). Keep announcements. Add a shared Carbon conversation dialog, student per-answer entry, and staff list in the existing communications area. All network operations use repositories. No deadlines, snapshots, assignment or notifications.
4. Verify frontend behavior, typecheck, affected quality gates, API manual flow in a separate dev service with this worktree source, and PostgreSQL backend tests via draft-PR CI. Record actual evidence and update the shared draft.

Review focus: untrusted answer/contest/message author; public visibility bypass; duplicate first message; send/close races; preserving drafts on failure; canceled publication hiding cached details; raw vs policy-adjusted score; old data preservation.

No production deployment or migration is included. Stop after reviewable implementation and verified results, leaving production data disposition explicit.

## Implementation evidence

- Draft PR: https://github.com/quan0715/QJudge/pull/295.
- Frontend full suite: 222 files, 1178 tests passed before adding the draft-preservation regression; focused dialog suite then passed all 3 tests. Typecheck and scoped lint passed (existing dashboard hook warnings remain).
- Fresh-context review found duplicate-open draft loss; reproduced with a failing test, then fixed by retaining the HTTP created/existing distinction.
- Local dev browser flow: student → manager → student → manager produced four messages, then separate close. Other student's detail request returned 404; a closed ticket rejected a new message with 409; score stayed 6/10.
- Multi-question browser validation caught a grading-link bug: byStudent ignores question selection. Changed to byQuestion, then verified the second answer changed 4→8 through the existing grading UI, its ticket showed 8/10, and the student result total refreshed to 14/20. Added a regression for the deep link.
- Desktop light and 390px mobile dark inspected; no horizontal overflow or JavaScript errors. This is local development proof, not a production release or course pilot.
- Additive migration applied in dev; all 6 historical Q&A records retained. Production data disposition is still open.
- Initial PostgreSQL CI exposed missing unique fixture emails; corrected. The PR's merged dev baseline also has a Carbon policy reference to removed SideMenuToggle.tsx, unrelated to appeal changes.
