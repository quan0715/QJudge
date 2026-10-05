# Password recovery verification plan

> **For agentic workers:** Use superpowers:executing-plans to continue this existing implementation task-by-task.

**Goal:** Finish PR #302's missing browser-to-worker-to-mail verification and align its deployment instructions with the approved Resend sender.

**Architecture:** Preserve the existing recovery API, opaque tokens, Celery job and Carbon screens. A CI-only SMTP inbox captures messages from the actual worker; Playwright follows the received link and verifies authentication outcomes.

**Tech Stack:** Django, Celery, PostgreSQL, React, Playwright, Mailpit.

**Spec:** `docs/api/password-recovery.md` and PR #302.

## Global constraints

- Preserve both dirty existing checkouts; start at PR head `7345698f`.
- Keep provider secrets out of source, logs and chat. The user enters real secrets.
- Use `QJudge <noreply@mail.q-judge.com>` for the documented Resend deployment.
- Run database-backed and full-stack verification in CI. Do not modify the running development or production stacks.
- Keep production recovery disabled until deployment mail configuration is installed and verified.

## Review focus

- A request must reach the asynchronous worker and SMTP inbox, not only return HTTP 202.
- Unknown identifiers must receive the same visible acknowledgement.
- Rejected passwords must not consume a usable recovery link.
- Successful recovery must reject the old password, accept the new password and reject reuse of the link.
- Direct recovery links must remain usable on mobile and in both themes.

## Task 1: Browser recovery coverage

- [ ] Add `frontend/tests/e2e/password-recovery.e2e.spec.ts`: real registration, request, captured email, validation, redemption, login and one-use assertions.
- [ ] Add CI-only `backend/config/settings/e2e.py` and Mailpit to `ci/compose.e2e.yml`; keep unit tests on locmem mail.
- [ ] Include the spec in `.github/workflows/e2e.yml`'s Auth group.
- [ ] Run static checks and existing recovery unit tests, then the Auth E2E workflow at the updated PR head.
- [ ] Address actual failures and inspect rendered recovery screens.

## Task 2: Deployment handoff

- [ ] Update `docs/api/password-recovery.md` with the approved sender, staged enablement, and CI reproduction commands.
- [ ] Review the complete change and update PR #302 with verified results and remaining production steps.
- [ ] Keep merge and production deployment separate from this development request.
