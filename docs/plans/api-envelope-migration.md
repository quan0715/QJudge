# API Envelope Migration Plan

**Created:** 2026-04-22
**Status:** in progress — phase 1 landed with AI grading performance work
**Reference:** [api-conventions.md](../api-conventions.md)

## Context

The project is standardising on a unified API response envelope
(`{data, meta}` for success, `{errors, meta}` for error). First
implementation landed on `contests/exam-answers/all-answers?projection=grading`
alongside the AI grading performance work. This document tracks what's
next.

---

## Landed so far

### Backend

- `apps/core/api/envelope.py`: `envelope()` / `envelope_error()` /
  `envelope_errors()` helpers.
- `apps/core/exceptions.py`: `custom_exception_handler` reshapes errors
  into envelope format for actions listed in `envelope_error_actions`;
  legacy `{success, error}` shape retained for the rest.
- `apps/contests/views/exam_answer.py`:
  - `all_answers` action supports `?projection=grading` (slim
    serializer, envelope) + `envelope_error_actions = {"all_answers"}`.
  - `dashboard_summary` gained `?kind=<alias|csv>` filter (not yet
    enveloped).
  - Dashboard cache removed (real-time stats).
- `apps/contests/views/exam_question.py`: `?kind=...` filter on list
  queryset (aliases: `subjective`, `objective`).
- `apps/contests/serializers.py`: new `ExamAnswerGradingSerializer`
  (slim projection: 11 fields, drops per-row question/participant name
  duplicates).

### Frontend

- `infrastructure/api/envelope.ts`: `BaseMeta`, `ApiEnvelope<T,M>`,
  `EnvelopeError`, `fetchEnvelope` helper.
- `infrastructure/api/repositories/examAnswers.repository.ts`:
  - New DTO + domain types for the grading projection.
  - `getAllExamAnswersForGrading(contestId, opts)` using `fetchEnvelope`.
- `infrastructure/api/repositories/examQuestions.repository.ts`:
  `getExamQuestions(contestId, { kind })` accepts kind filter.
- `infrastructure/api/repositories/exam.repository.ts`:
  `getExamDashboardSummary(contestId, { kind })` accepts kind filter.
- `features/contest/screens/settings/grading/`:
  - `buildGradingRows` now consumes slim DTOs and joins question /
    participant info from separately-fetched maps.
  - `useAiGradingScreenData` hook: lazy per-question loading, caches raw
    DTOs, derives rows via `useMemo` so participants/questions loading
    late still populates student names.
  - AI grading screen + card use the new hook; cards display
    original-vs-AI score/feedback split.

### MCP server

No changes required. `qjudge_grading list_answers` hits `/all-answers/`
**without** `?projection=grading`, so it receives the untouched legacy
bare-array response.

---

## Phase 2 — Broaden envelope coverage

Goal: migrate the highest-leverage endpoints so the envelope becomes the
default shape for new UI work, not an exception.

### 2.1 Candidate endpoints (by priority)

Prioritise by payload size and caller count.

| Endpoint | Why | Projection / filter |
|---|---|---|
| `GET /contests/{id}/exam-answers/dashboard-summary/` | Already accepts `?kind=`; wraps cleanly in envelope. Callers: AI grading screen, regular grading screen. | none / `kind` |
| `GET /contests/{id}/exam-questions/` | Central to many admin screens; payload heavy with snapshots. | `kind`, possibly `projection=list` (drop snapshot). |
| `GET /contests/{id}/exam-answers/results/` | Student-facing results. Error handling benefits from structured `errors`. | possibly `projection=student` |
| `GET /contests/{id}/exam-answers/all-answers/` (legacy no-projection) | Still heavy for non-AI callers (`ExamResultsSummary`, `PaperExamResultsList`). Migrate once those callers are ready. | — |
| `GET /contests/` (list) | DRF paginated — **skip envelope**, keep paginated shape. |  |

### 2.2 Per-endpoint checklist

For each endpoint chosen from the list:

1. Decide gating: breaking-change? → add `?projection=<name>`. Internal
   only? → can change directly.
2. Pick / write a slim serializer if the projection is about payload
   size.
3. Switch response to `envelope()`.
4. Add action to view's `envelope_error_actions`.
5. Add / update FE repo function to use `fetchEnvelope` + strongly-typed
   `Meta`.
6. Update callers; ensure UI error handling catches `EnvelopeError`
   where needed.
7. Regression check: tsc, eslint, vitest, relevant pytest.
8. Grep mcp-server for the endpoint; coordinate if reading affected
   fields.

### 2.3 Acceptance for phase 2

- At least 3 additional endpoints migrated.
- At least one endpoint migrated **without** projection (breaking) to
  prove the direct-migration path works for internal APIs.
- Updated [api-conventions.md](../api-conventions.md) "migration status"
  table.

---

## Phase 3 — Type and tooling hardening

Goal: make envelope usage a typed, tooling-enforced convention rather
than a shared verbal agreement.

### 3.1 Strongly-typed `Meta` per endpoint

Replace ad-hoc `Record<string, unknown>` meta usage with per-endpoint
interfaces (e.g. `GradingListMeta extends BaseMeta`). Repository
function return types should expose the specific meta so UI gets
autocomplete.

### 3.2 OpenAPI / `schema.yml` alignment

`drf-spectacular` currently documents the envelope's `data` payload but
not the wrapper. Two options:

- Write a generic `EnvelopeSerializer` wrapper and pass it through
  `OpenApiResponse(response=...)` for opted-in actions.
- Configure the global schema generator so it always wraps responses
  from views with `envelope_error_actions` set.

Pick after phase 2 — the right solution will be clearer once more
endpoints are enveloped.

### 3.3 Regression safeguards

- Backend lint (flake8/ruff plugin or CI grep): forbid hand-assembling
  `Response({"data": ..., "meta": ...})` outside helpers. Force usage of
  `envelope()` / `envelope_error()`.
- Frontend lint: forbid `requestJson` for files that import
  `EnvelopeError` or `fetchEnvelope` (mixed use is a migration smell).

---

## Phase 4 — Meta enrichment

Add optional fields that the current envelope does not yet surface.
Rollout order reflects expected leverage:

1. **`warnings` field** — for batch / partial-success operations (AI
   `batch_grade`, bulk import). Shape:
   ```json
   { "data": [...], "meta": {...}, "warnings": [{ "code": "...", "message": "...", "item_id": "..." }] }
   ```
2. **`meta.deprecations`** — broadcast upcoming field removals:
   ```json
   "meta": { "deprecations": ["field X removed in 2026-06"] }
   ```
   FE helper logs a dev-console warning when present; no UI impact.
3. **`meta.schema_version`** — bump on breaking changes so clients can
   gate behaviour.
4. **`meta.server_time_ms` / `meta.cached` / `meta.cache_hit`** — debug
   hints. Low priority; add when needed.

Each addition updates the Base types in
`frontend/src/infrastructure/api/envelope.ts` and
`backend/apps/core/api/envelope.py`.

---

## Phase 5 — Legacy retirement

Once the vast majority of endpoints are on the envelope:

1. Remove the legacy branch in
   `apps/core/exceptions.custom_exception_handler` so the envelope
   shape is unconditional.
2. Update mcp-server's `django_api` wrapper to parse envelope
   responses (unwrap `.data`; surface `errors` structurally).
3. Drop the `requestJson` fallback in FE repos; remaining callers
   migrate or get deleted.
4. Mark `{success, error}` shape deprecated in
   [api-conventions.md](../api-conventions.md) with a removal date.

---

## Parallel AI-grading polish work

The AI grading screen has expanded in scope during this performance
work — URL-based session restore, rubric display, task status tracking,
per-card state (`idle` / `pending` / `reviewable` / `missing`). These
are independent of the envelope migration but share some hook surface.
Tracking here so the two threads stay aligned:

- `useAiQuestionGrading` now exposes `sessionId`, `trackedQuestionId`,
  `taskStatus`, `rubricMarkdown`, `hasGradeArtifact`, `loadSessionTask`,
  `restore`. These should be stable before envelope changes touch the
  AI grading repository functions.
- The screen binds `?session=` via search params. Verify this survives
  page refresh scenarios before migrating additional related endpoints
  (to avoid compound churn).
- Card status derivation (`getCardStatus`) depends on
  `resultsByAnswerId` shape. Envelope changes to AI grading endpoints
  must preserve that shape.

---

## Risks and open questions

- **Phase 2 pace vs. AI grading iteration**: if the AI grading hook is
  still evolving, migrate non-AI endpoints first to avoid repeated
  churn of the same files.
- **mcp-server coordination**: any phase-5 migration of
  `/all-answers/` without projection or of `/exam-questions/` needs a
  mcp-server PR in the same window. Start a dependency note on each PR.
- **Error codes convention drift**: current codes mix snake case
  (`permission_denied`) and UPPER (`UNKNOWN_ERROR`). Decide on a single
  casing for envelope errors (recommendation: snake case — matches
  DRF's `default_code`). Update convention doc when chosen.
- **OpenAPI tooling**: hand-tuned wrapper serializers are easy to miss.
  Prefer a generic solution before too many endpoints are migrated.

---

## How to pick up this work

1. Read [api-conventions.md](../api-conventions.md) first.
2. For each endpoint, follow the Phase 2.2 checklist.
3. Update the Phase 2.1 table in this plan (check off + move to
   `landed`).
4. If a decision is needed (error code casing, OpenAPI approach),
   surface it here under "risks and open questions" with a proposed
   resolution.
