# API Contract Convergence Design

**Status:** user-domain pilot scoped; implementation plan ready

> 2026-09-28：保留為設計紀錄。7 月依此計畫開始的 users 網域實作未完成且已擱置（程式碼已與目前 dev 分歧）；日後若採用，依目前程式碼重新實作。

## Goal

Make every QJudge-owned JSON resource endpoint under `/api/v1` expose one
response contract. The first implementation is a complete user-domain
vertical slice; it proves the contract before the same hard cut expands to
other domains. A client of an included endpoint must never branch on a legacy
`{success, error}` shape, a bare serializer payload, or a DRF pagination
payload.

## Rollout Scope

### First vertical slice

The initial implementation includes every JSON route implemented by
`apps.users`:

- `/api/v1/users`
- `/api/v1/auth`
- `/api/v1/action-links`

This includes password credential registration/login, provider login/callback,
token refresh/logout, session management, current account, preferences,
avatar upload, admin user search/role update, and magic-link lifecycle
responses. The DEBUG-only token endpoint follows the same contract for test
and development consistency, but remains excluded from public documentation.

Within this slice, the cut is complete: no included endpoint exposes a legacy
response or accepts a compatibility switch. Other domain routes are outside
this implementation slice, not an alternative representation of these user
routes.

### End state

After the user-domain pilot passes its release gate, apply the same contract
to the remaining QJudge-owned JSON resource endpoints under `/api/v1`:

- markdown JSON endpoints and management problems
- submissions, contests, classrooms, question banks, and announcements
- AI public and `_internal` JSON endpoints
- subscriptions JSON endpoints, until the billing integration is separately
  retired

The same rules apply to successful, validation, permission, not-found,
conflict, throttling, and service-overload responses.

### Excluded

The following endpoints retain their protocol-defined or binary behaviour and
must be explicitly marked contract-exempt:

- OAuth metadata, dynamic client registration, authorization, token, consent,
  and callback routes outside `/api/v1`
- Recur's inbound webhook at `/api/v1/subscriptions/webhooks/recur/`
- server-sent event streams
- file, image, CSV, Markdown, and PDF downloads
- OpenAPI and documentation routes

An exclusion is determined by content/protocol, not by a generic legacy
allowlist. A normal QJudge JSON resource route cannot opt out.

## Canonical Wire Contract

### Successful JSON response

Every in-scope `2xx` response has this exact top-level shape:

```json
{
  "data": {},
  "meta": {}
}
```

- `data` is required and may be an object, array, scalar, or `null`.
- `meta` is required and is always an object. It contains endpoint-specific
  non-resource information only.
- Command actions that have no resource payload return `"data": null`; they
  do not use HTTP `204`, because a `204` cannot carry the contract body.
- Existing resource fields remain inside `data`; their field names and
  semantics are not otherwise redesigned in this migration.

### Resource object schemas

`data` is never documented as an unnamed or free-form object. Every endpoint
declares a named schema for the exact resource projection it returns. For
example, the user-domain pilot declares `GET /api/v1/users/me` as
`data: UserObject`; its field names, types, nullability, and nested `profile`
object are defined in OpenAPI and repeated in the corresponding Notion page.

Named object schemas are reused whenever their field set and authorization
exposure are identical. The pilot deliberately aligns all account-shaped
responses behind the one `UserObject`, rather than multiplying current-user,
list-item, and admin-user variants. A distinct schema name is warranted only
when it represents a genuinely different resource or exposure contract. The
same rule applies to every domain.

The endpoint contract therefore reads as a composition rather than a vague
JSON example:

```text
GET /api/v1/users/me
200: { data: UserObject, meta: {} }
```

`meta` has named schemas as well when it contains endpoint-specific values,
such as `PaginationMeta`. It never carries a resource object that belongs in
`data`.

### User-domain object catalogue

The pilot deliberately defines one canonical account representation rather
than a family of nearly identical user objects:

```text
UserObject
  id: integer
  username: string
  email: string
  role: "student" | "teacher" | "admin"
  auth_provider: string
  last_login_at: date-time | null
  onboarding_completed_at: date-time | null
  profile: UserProfileObject

UserProfileObject
  display_name: string
  avatar_url: string | null

UserSettingsObject
  profile: UserProfileObject
  preferences: UserPreferencesObject
  onboarding_completed_at: date-time | null

UserPreferencesObject
  preferred_language: string
  preferred_theme: string
  editor_font_size: integer
  editor_tab_size: integer

UserSettingsPatchRequest
  profile?: { display_name?: string, avatar_url?: string | null }
  preferences?: {
    preferred_language?: string,
    preferred_theme?: string,
    editor_font_size?: integer,
    editor_tab_size?: integer
  }
  onboarding_completed_at?: date-time | null
```

`UserProfileObject` is nested in `UserObject` for display identity.
`GET` and `PATCH /api/v1/users/me/preferences` return `UserSettingsObject`,
which carries editable preferences without leaking those fields to an admin
user list or an authentication response. Subscription state remains available
only from its dedicated billing endpoint while that integration exists.
`PATCH /api/v1/users/me/preferences` accepts `UserSettingsPatchRequest`; its
request is intentionally shaped like the corresponding response, with
identity fields under `profile` and editor/application choices under
`preferences`. Omitting a member leaves it unchanged. This replaces the
legacy flattened request body in the same hard cut.

`solved_count`, `submission_count`, and `accept_rate` remain internal
denormalized model fields. They are not exposed by this pilot. A future
statistics screen must first define its metrics and then add a dedicated
statistics endpoint; no dormant statistics endpoint is retained now.

The following routes reuse `UserObject` instead of defining account-shaped
exceptions:

- `GET` and `PATCH /api/v1/users/me`
- `GET /api/v1/users` as `UserObject[]`
- `PATCH /api/v1/users/{id}/role`
- `AuthSessionObject.user` returned by register, provider login, and OAuth
  callback
- the authenticated user returned from action-link consumption

The pilot uses distinct names only for genuinely different resources or
action results: `AuthSessionObject`, `AuthProviderOptionsObject`,
`AccessTokenObject`, `LoginRecordObject`, `LogoutOtherSessionsResultObject`,
`AvatarUploadResultObject`, and the existing action-link objects. Those names
describe their own data; none is another user projection.

The user-search migration moves the existing flattened `display_name` to
`profile.display_name`. `onboarding_completed_at` remains a top-level account
state needed by the current admin workflow. No settings, statistics, account
activation flag, creation time, or billing state is included in the list.

### Paginated JSON response

Paginated resource lists use the same outer shape. The list itself is `data`;
DRF pagination fields move to `meta.pagination`:

```json
{
  "data": [{"id": "..."}],
  "meta": {
    "pagination": {
      "count": 42,
      "next": "https://api.example.test/api/v1/resources/?page=2",
      "previous": null
    }
  }
}
```

`count`, `next`, and `previous` retain DRF's current meanings. The migration
does not add offset, cursor, or page-size semantics.

### Error JSON response

Every in-scope `4xx` or `5xx` JSON response has this exact top-level shape:

```json
{
  "errors": [
    {
      "code": "permission_denied",
      "message": "Only contest staff can view this resource.",
      "field": null,
      "details": {}
    }
  ],
  "meta": {
    "request_id": "req_...",
    "timestamp": "2026-07-13T04:00:00+00:00"
  }
}
```

- `errors` is required and non-empty.
- `code` is a stable lower-snake-case machine identifier.
- `message` is human-readable and is not a client control value.
- `field` is a request field name for field validation, otherwise `null`.
- `details` is always an object; endpoint-specific data belongs here rather
  than as a second top-level error shape.
- `meta.request_id` and `meta.timestamp` are required for every error.
- HTTP status remains the source of transport semantics; the migration does
  not turn failures into `200` responses.

## Architecture

### Backend response boundary

Introduce a DRF JSON renderer dedicated to the contract. During the pilot it
is applied to every included `apps.users` response through a domain-level view
marker, so ordinary user serializers cannot accidentally bypass the envelope.
It is not enabled for other domain routes until their clients migrate. After
the pilot proves the behaviour, promote the same renderer to the remaining
included domains without adding a response-format switch to any user route.

For an included successful response, the renderer:

1. treats the existing response body as the resource payload;
2. recognizes the standard DRF page object and moves its pagination members
   into `meta.pagination`;
3. emits the canonical `{data, meta}` object.

The renderer does not translate legacy `{success, data}` or `{success, error}`
source bodies. Those hand-built source responses are removed during this
migration. This keeps the renderer an enforcement boundary rather than a
permanent compatibility layer.

The global exception handler detects the explicit contract marker during the
pilot and emits the canonical error object for all handled DRF exceptions and
the existing database-overload path. It does not use action-level opt-in.
Domain helpers that manually return an error use a single core error-response
helper with the same shape. Once all domains migrate, this marker becomes the
global default and the legacy branch is removed.

An API-aware Django `500` handler covers exceptions that DRF does not handle.
In production it returns the canonical `internal_error` response for included
routes after normal error reporting. In DEBUG it preserves Django's re-raise
behaviour so development failures remain debuggable. Excluded protocol routes
keep their native failure behaviour.

`JsonResponse` is not permitted for included JSON resources because it would
bypass DRF rendering. Any remaining in-scope uses migrate to DRF `Response`.
Protocol and binary exclusions remain on their native Django response classes.
The sole framework-level exception is Django's unhandled-500 handler: because
it runs outside DRF dispatch, it returns the same canonical error document as
a native JSON response. It is not an endpoint implementation or an alternate
success/error format.

### Frontend and service clients

Converge user-domain frontend repositories on one typed request function that:

- unwraps `{data, meta}` only after validating the canonical successful shape;
- raises one typed contract error from the canonical `errors` array;
- preserves HTTP status, error code, field, details, request ID, and timestamp.

Remove the legacy response coercion from `fetchEnvelope` and retire duplicate
legacy `requestJson` response parsing for the included user APIs. Update every
frontend and in-repository service client that reads an included endpoint
before changing that endpoint's wire shape. Other domains keep their current
client path until their own migration slice starts.

### OpenAPI and Notion documentation

Add a schema integration that wraps included JSON success serializers in the
canonical envelope and publishes a shared error-envelope component for all
documented error statuses. Pagination uses the canonical `data` array plus
`meta.pagination` schema.

Regenerate `backend/schema.yml` from the updated schema. The Notion API DB
must then use the same canonical examples for every included user-domain
endpoint while retaining endpoint-specific body, query, authorization, status,
and error-code information. Excluded protocol and binary endpoints document
their native responses instead.

## Migration Rules

1. This is a breaking change for every endpoint in the user-domain pilot. No
   included endpoint returns the legacy `success` boolean or top-level
   singular `error` after merge.
2. Do not add a compatibility header, query parameter, version switch, or
   frontend fallback parser.
3. Convert all in-repository clients in the same change set. External
   protocol contracts are excluded rather than silently reshaped.
4. Preserve status codes except replace an included `204` success with an
   explicit JSON `200` contract response containing `data: null`.
5. Preserve authorization behaviour and every field with an active UI or
   service consumer. The pilot intentionally removes unused user statistics,
   account activation state, creation time, and billing projection from user
   responses; it moves editable settings to `UserSettingsObject` and nests the
   admin display name under `UserObject.profile`.
6. New user-domain endpoints inherit the contract automatically from the
   domain base view. When the rollout expands, the same rule applies to every
   migrated domain. An explicit exemption requires a non-JSON or external
   protocol reason and a test.

## Verification

The implementation is complete only when all of the following hold:

- Backend contract tests cover a normal success, a standard DRF pagination
  payload at the renderer boundary, validation error, permission error,
  not-found error, throttling/service error, and a contract-exempt binary or
  streaming route.
- Tests prove included `204` responses are converted to canonical JSON and
  excluded protocol/binary responses remain unwrapped.
- A source-level regression test rejects legacy `success`/singular `error`
  response construction and `JsonResponse` use in included endpoint modules.
- Frontend and any in-repository client of a user-domain endpoint prove
  successful unwrapping and structured canonical error handling.
- `schema.yml` declares the canonical success, pagination, and error shapes
  for every user-domain route, including named `UserObject` schemas.
- Every included Notion API DB page has concrete request/response/error
  examples matching the generated schema and tested runtime behaviour.
- Targeted backend/client suites and release gates pass before the PR is
  opened against `dev`.

## Non-goals

- Redesigning domain payload fields, permissions, route names, or HTTP status
  semantics beyond replacing in-scope `204` responses.
- Retiring the Recur billing integration or `QuestionBankSubscription`.
- Changing OAuth, webhook, SSE, or binary protocol payloads.
- Introducing a new API version or retaining a legacy response fallback.
- Migrating non-user application domains before the user-domain pilot is
  verified and released.
