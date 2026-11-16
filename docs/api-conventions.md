# QJudge API conventions

This document describes the current implementation. JSON response migration is
incomplete: callers must use the contract of the specific endpoint, not infer it
from the `/api/v1` prefix. See [Users API contract](api/users-contract.md) for the
migrated users/auth/action-links domain.

## Current response shapes

An envelope success contains exactly `data` and `meta`:

```json
{"data": {"id": 7}, "meta": {}}
```

`data` may be an object, array, or null. `meta` is required and must be an object;
its contents depend on the endpoint. Success responses do not automatically
include request IDs or timestamps.

An envelope error contains exactly `errors` and `meta`:

```json
{
  "errors": [{
    "code": "permission_denied",
    "message": "Permission denied.",
    "field": null,
    "details": {}
  }],
  "meta": {"request_id": "request-1", "timestamp": "2026-11-13T00:00:00Z"}
}
```

`errors` is nonempty. The frontend requires each item to have string `code` and
`message`, a null/string `field`, and object `details`. The users contract uses
lower-case codes. The generic `envelope_error()` helper preserves the supplied
code, so code casing is not yet globally normalized.

The exception handler adds `meta.request_id` and `meta.timestamp` for opted-in
errors; `request_id` may be null. The manual `contract_error_response()` and
`contract_validation_error_response()` helpers also add these fields. In
contrast, `envelope_error()` / `envelope_errors()` default to `meta: {}` unless
metadata is supplied. Do not assume every current manual error has correlation
metadata merely because its envelope is structurally valid.

Unmigrated endpoints still return bare objects/arrays or DRF pagination. Their
default DRF exception format is:

```json
{"success": false, "error": {"code": "PERMISSION_DENIED", "message": "..."}}
```

The handler also supplies request metadata and may include validation details
inside `error`. Manually returned errors and upstream proxies have additional
endpoint-specific shapes; the global exception handler does not rewrite an
ordinary `Response(...)` returned by a view.

## Pagination and empty responses

There are currently two pagination contracts:

| Boundary | JSON shape |
| --- | --- |
| `ContractJSONRenderer` (currently users/auth/action-links) | `{data: [...], meta: {pagination: {count, next, previous}}}` |
| Unmigrated DRF pagination | `{count, next, previous, results: [...]}` |

`ContractJSONRenderer` converts successful HTTP 204 responses to HTTP 200 with
`data: null`. This is not a global conversion: other endpoints can still return
204, and `fetchEnvelope` rejects an empty body. Use `ensureOk` where the existing
endpoint contract intentionally has no response body.

OAuth/OIDC protocol responses, health probes, signed internal integrity
protocols, SSE, binary downloads and streaming responses are not application
JSON envelope migration targets by default. Do not wrap them simply because
some URLs contain `/api/`.

## Backend implementation boundaries

Two mechanisms are in use:

1. Users views inherit `SchemaAPIView` in `backend/apps/users/views/common.py`.
   It sets `api_contract_enabled = True` and uses `ContractJSONRenderer`.
   Views return raw success data; the renderer wraps it. **Do not call
   `envelope()` for a success already passing through this renderer:** the
   current renderer would wrap it twice.
2. Selected contest actions call `envelope()` explicitly and opt into exception
   conversion with `envelope_error_actions`. That attribute controls exceptions,
   not success rendering or manually constructed errors.

For explicit envelope actions, use the helpers in
`backend/apps/core/api/envelope.py`, rather than constructing envelope JSON by
hand. For request-aware manual errors, prefer `contract_error_response()` or
`contract_validation_error_response()`; preserve the endpoint's existing error
codes and semantics until its contract migration is coordinated with callers.

`backend/apps/core/exceptions.py` selects envelope errors when either the view
has `api_contract_enabled` or its action is in `envelope_error_actions`.
Unmarked views retain the legacy exception format. The production framework
500 handler in `backend/apps/core/views/errors.py` currently covers only
`/api/v1/users`, `/api/v1/auth`, and `/api/v1/action-links`; it is not a global
JSON error boundary.

## Frontend and other callers

`frontend/src/infrastructure/api/envelope.ts` provides:

```ts
interface ApiEnvelope<TData, TMeta extends BaseMeta = BaseMeta> {
  data: TData;
  meta: TMeta;
}
```

`fetchEnvelope<TData, TMeta>(request, fallbackMessage)` resolves to
`{data, meta}`. It throws `EnvelopeError` for valid error envelopes. Legacy
errors, missing/non-object `meta`, extra top-level keys, invalid error items,
empty bodies and invalid JSON are rejected as `envelope_malformed`.
**It does not silently translate legacy responses.** Network failures can still
propagate independently of `EnvelopeError`.

For example, the grading query is already migrated:

```ts
const { data, meta } = await fetchEnvelope<ExamAnswerGradingDto[], GradingListMeta>(
  httpClient.get(
    `/api/v1/contests/${contestId}/exam-answers/all-answers/?projection=grading`,
  ),
  "Failed to fetch grading answers",
);
```

Use the `ExamAnswerGradingDto` and `GradingListMeta` definitions/imports from the
existing `examAnswers.repository.ts` implementation when extending this call.
Catch `EnvelopeError` to inspect `status`, `errors`, `meta`, or the first `code`.

`requestJson<T>` in `http.client.ts` returns the success body without unwrapping
it. Its error message extractor currently reads `error.message`; an envelope
error instead falls back to the caller's generic message. It attaches the raw
body to `error.response.data`. Switching only a backend's response format can
therefore lose error messages or break mapping, even when HTTP status is unchanged.
Some repositories also parse JSON directly or use their own request helper.
Migration inventory must include those, not only `requestJson` imports.

MCP's `mcp-server/server.py` formats multiple error shapes but returns successful
Django JSON as received. The paper CLI in `tools/qjudge-paper-cli` has separate
bare-array, DRF-pagination and envelope readers. Neither is automatically
migrated by changing the frontend helper.

## Verified migration status

This is a summary of known boundaries, not an exhaustive endpoint inventory.

| Endpoint / domain | Current success | Current exception handling |
| --- | --- | --- |
| JSON users/auth/action-links views inheriting `SchemaAPIView` | Renderer envelope | Envelope |
| `exam-answers/results/` | Explicit envelope | Envelope |
| `exam-answers/all-answers/?projection=grading` | Explicit envelope | Envelope |
| `exam-answers/all-answers/` without that projection | Bare array | Envelope (same action) |
| Grade appeal list/create/retrieve/messages/close/reopen | Explicit envelope | Envelope |
| `exam-questions/?kind=...` | Bare array | Legacy by default |
| `exam-answers/dashboard-summary/?kind=...` | Bare object | Legacy by default |
| Other classroom/problem/submission/exam/AI endpoints | Endpoint-specific; inspect view and caller | Legacy by default, with manual/proxy exceptions |

Source owners: `backend/apps/contests/views/exam_answer.py`,
`grade_appeal.py`, `exam_question.py`, and the matching frontend repositories.
Do not treat the table as permission to change unrelated endpoints globally.

## Query parameters

- Use snake-case IDs such as `question_id`, `participant_id`, `user_id`.
- `projection=grading` on `all-answers` selects both slim fields and an envelope;
  omitting it currently changes the top-level shape as well.
- `kind` supports aliases such as `subjective` and `objective`, and comma-separated
  question types where implemented. Unknown tokens are ignored by these filters;
  do not generalize that behavior to all API validation.
- Preserve existing `page` / `page_size` behavior during response migration.

## Verification and change discipline

Relevant tests include `frontend/src/infrastructure/api/envelope.test.ts`,
`backend/apps/core/tests/test_user_contract_boundary.py`,
`backend/apps/users/tests/test_api_contract.py`, and per-domain repository/API tests.
The generated schema is `backend/schema.yml`; users-domain schema wrapping is
implemented in `backend/apps/users/schema.py`.

Changing response shape requires coordinated backend, frontend, MCP/CLI and
schema changes for the selected endpoints. Do not add permissive fallback
parsing to `fetchEnvelope`, or enable the users renderer globally. Database
migrations and `legacy_schema_alignment.py` are unrelated to this API work and
remain unchanged.
