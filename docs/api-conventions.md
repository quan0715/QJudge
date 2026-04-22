# QJudge API Conventions

**Status:** active, first implementation landed 2026-04 on
`contests/exam-answers/all-answers?projection=grading`. The conventions below
will tighten as more endpoints migrate.

Jump to:

- [1. Response shapes](#1-response-shapes)
- [2. When to use the envelope](#2-when-to-use-the-envelope)
- [3. Backend contract](#3-backend-contract)
- [4. Frontend contract](#4-frontend-contract)
- [5. Query param conventions](#5-query-param-conventions)
- [6. Migration status](#6-migration-status)
- [7. Quick reference](#7-quick-reference)

---

## 1. Response shapes

### Success

```json
{ "data": <payload>, "meta": { ... } }
```

- `data`: main payload. Array, object, or `null`.
- `meta`: optional hints. Always present as at least `{}`; do not omit.
  Common keys: `count`, `projection`, filter echo (`question_id`),
  `request_id`, `timestamp`. Extensions are opt-in per endpoint.

### Error

```json
{
  "errors": [
    {
      "code": "permission_denied",
      "message": "Only contest staff can view all answers.",
      "field": null,
      "details": {}
    }
  ],
  "meta": {
    "request_id": "...",
    "timestamp": "2026-04-22T..."
  }
}
```

- `errors`: non-empty array. Validation errors may be multiple entries
  with distinct `field` values.
- Each entry:
  - `code`: snake-case string (mirrors DRF `default_code`).
  - `message`: human-readable.
  - `field`: field name on validation errors, `null` otherwise.
  - `details`: object for per-error extensions (retry-after, validator
    data). Default `{}`.
- `meta.request_id` + `meta.timestamp`: always emitted on error envelopes.

### Paginated (unchanged)

DRF's native paginated list endpoints keep the legacy
`{count, next, previous, results}` shape. **Do not** wrap them in the
envelope — the pagination metadata already serves the same role as
`meta`, and double-wrapping hurts both clients and schema generation.

---

## 2. When to use the envelope

| Scenario | Shape |
|---|---|
| Non-paginated collection (custom action, filtered query) | ✅ Envelope |
| Non-paginated single resource (retrieve) | ✅ Envelope |
| Paginated DRF list | ❌ DRF native `{count, next, previous, results}` |
| Boolean / command action (e.g. `POST /x/submit/`) | ✅ Envelope (`data: null` allowed) |
| Streaming / binary / SSE / file download | ❌ unchanged |

---

## 3. Backend contract

### Success

```python
from apps.core.api.envelope import envelope

return envelope(data, meta={"count": N, "projection": "grading"})
```

Do **not** hand-assemble `Response({"data": ..., "meta": ...})`; always go
through the helper to prevent shape drift.

### Errors (opt-in per action)

Declare `envelope_error_actions` on the viewset:

```python
class MyViewSet(viewsets.GenericViewSet):
    envelope_error_actions = {"my_action", "another_action"}
```

For listed actions, the global handler in
`apps/core/exceptions.custom_exception_handler` reshapes every
`PermissionDenied` / `ValidationError` / `NotFound` / etc. into the
envelope error format. All other actions keep the legacy
`{success, error}` shape until migrated.

Manual error paths:

```python
from apps.core.api.envelope import envelope_error, envelope_errors

return envelope_error("resource_locked", "This resource is locked", status=423)
return envelope_errors([
    {"code": "field_required", "message": "...", "field": "name"},
    {"code": "field_required", "message": "...", "field": "email"},
], status=400)
```

### Implementation locations

- `backend/apps/core/api/envelope.py` — `envelope()`, `envelope_error()`,
  `envelope_errors()` helpers.
- `backend/apps/core/exceptions.py::custom_exception_handler` — exception
  reshaping, opt-in via `envelope_error_actions`.

---

## 4. Frontend contract

### Types

See `frontend/src/infrastructure/api/envelope.ts`:

```ts
interface ApiEnvelope<TData, TMeta extends BaseMeta = BaseMeta> {
  data: TData;
  meta?: TMeta;
}

interface ApiErrorItem { code, message, field?, details? }
interface ApiErrorEnvelope { errors: ApiErrorItem[]; meta?: BaseMeta; }

class EnvelopeError extends Error { status; errors; meta; code; }
```

### Repository functions

Go through `fetchEnvelope` for every envelope-aware endpoint:

```ts
import { fetchEnvelope } from "@/infrastructure/api/envelope";

export const getFoo = async (
  id: string,
  opts: { kind?: string } = {},
): Promise<{ data: FooDto[]; meta: FooMeta }> => {
  const search = new URLSearchParams();
  if (opts.kind) search.set("kind", opts.kind);
  const query = search.toString();
  return fetchEnvelope<FooDto[], FooMeta>(
    httpClient.get(`/api/v1/foo/${id}/${query ? `?${query}` : ""}`),
    "Failed to fetch foo",
  );
};
```

- Success: returns `{ data, meta }` with the envelope unwrapped.
- Failure: throws `EnvelopeError`. Legacy `{success, error}` payloads are
  coerced into the same error class so UI error handling does not need
  to fork during the migration window.

### UI error handling

```ts
try {
  const { data, meta } = await getFoo(id);
  // ...
} catch (err) {
  if (err instanceof EnvelopeError) {
    // err.status, err.errors, err.code, err.meta
  } else {
    // network / unexpected
  }
}
```

### Not to be used for envelope endpoints

`requestJson` is retained only for endpoints that have not yet migrated.
Do not use it for new envelope-aware functions.

---

## 5. Query param conventions

| Purpose | Param | Example |
|---|---|---|
| Slim projection | `projection` | `?projection=grading` |
| Enum filter | `kind` | `?kind=subjective`, `?kind=short_answer,essay` |
| ID filter | `<resource>_id` | `?question_id=...`, `?participant_id=...` |
| Pagination (DRF) | `page` / `page_size` | unchanged |

### `projection`

- Values are canonical strings (`grading`, `summary`, `card`, `detail`).
- Omitting the param returns the original/full shape (backward
  compatibility).
- `meta.projection` echoes the applied projection so clients can verify.

### `kind`

- Accepts aliases (`subjective`, `objective`) and CSVs of enum values
  (`short_answer,essay`).
- Unknown tokens are ignored (resulting in an empty set, not a 400) —
  filter-only query params should tolerate client typos gracefully.
- When two endpoints share `kind` semantics, they must define the same
  alias map. Current shared map
  (`ContestExamQuestionViewSet` + `ExamAnswerViewSet.dashboard_summary`):
  - `subjective` → `{short_answer, essay}`
  - `objective` → `{true_false, single_choice, multiple_choice}`

---

## 6. Migration status

### Migrated

| Endpoint | Success envelope | Error envelope | Filters |
|---|---|---|---|
| `GET /contests/{id}/exam-answers/all-answers/?projection=grading` | ✅ | ✅ | `question_id`, `user_id`, `participant_id` |

### Partial (filter added, envelope pending)

| Endpoint | Notes |
|---|---|
| `GET /contests/{id}/exam-questions/?kind=...` | `kind` filter landed; still bare array. |
| `GET /contests/{id}/exam-answers/dashboard-summary/?kind=...` | `kind` filter landed; still bare object. |

### Legacy (no envelope)

Everything else. Errors continue to use the legacy `{success, error}`
shape served by `custom_exception_handler`.

---

## 7. Quick reference

**New view**

```python
from apps.core.api.envelope import envelope

class FooViewSet(viewsets.GenericViewSet):
    envelope_error_actions = {"list", "detail"}

    @action(detail=False)
    def list(self, request):
        data = FooSerializer(queryset, many=True).data
        return envelope(data, meta={"count": len(data)})
```

**New repository function**

```ts
export const getFoo = async (
  id: string,
  opts: { kind?: string } = {},
): Promise<{ data: FooDto[]; meta: FooMeta }> =>
  fetchEnvelope<FooDto[], FooMeta>(
    httpClient.get(buildUrl("/api/v1/foo/", { id, ...opts })),
    "Failed to fetch foo",
  );
```

**UI error handling**

```ts
try {
  const { data, meta } = await getFoo(id);
} catch (err) {
  if (err instanceof EnvelopeError) {
    // err.status, err.errors, err.code
  }
}
```

---

## Reference implementation

Landed with the 2026-04 AI grading performance work:

- Backend: `backend/apps/core/api/envelope.py`,
  `backend/apps/core/exceptions.py`,
  `backend/apps/contests/views/exam_answer.py` (`all_answers` action).
- Frontend: `frontend/src/infrastructure/api/envelope.ts`,
  `frontend/src/infrastructure/api/repositories/examAnswers.repository.ts`
  (`getAllExamAnswersForGrading`).

See `docs/plans/api-envelope-migration.md` for the roadmap forward.
