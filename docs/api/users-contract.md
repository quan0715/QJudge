# Users API contract

The JSON endpoints under `/api/v1/users`, `/api/v1/auth`, and `/api/v1/action-links` use one HTTP contract. Other application domains retain their existing formats. The frontend and backend changes must ship together.

A successful response is `{ "data": <resource, array, or null>, "meta": {} }`. Commands such as logout return HTTP 200 with `data: null`. A paginated response places the array in `data` and `{count, next, previous}` under `meta.pagination`.

An error is `{ "errors": [{ "code": "lower_snake_case", "message": "...", "field": null, "details": {} }], "meta": { "request_id": "...", "timestamp": "..." } }`. Validation errors identify fields using dotted paths, for example `preferences.editor_tab_size`. An active-exam login conflict remains HTTP 409; its exam details are in `errors[0].details.active_exam`.

`UserObject` contains only `id`, `username`, `email`, `role`, `auth_provider`, `last_login_at`, `onboarding_completed_at`, and `profile: {display_name, avatar_url}`. An unset avatar is `null`. This projection is shared by login, current-user, search, and role-update responses. Statistics remain stored in the database but are not account settings.

`GET /api/v1/users/me/preferences` returns `UserSettingsObject`:

```json
{
  "data": {
    "profile": {"display_name": "Ada", "avatar_url": null},
    "preferences": {
      "preferred_language": "zh-TW",
      "preferred_theme": "system",
      "editor_font_size": 14,
      "editor_tab_size": 4
    },
    "onboarding_completed_at": null
  },
  "meta": {}
}
```

PATCH uses the same nested fields. Omitted fields remain unchanged; `profile.avatar_url: null` clears an avatar. Completing onboarding records server time. Unknown settings fields and the old flat request shape are rejected.

Use `fetchEnvelope` in the frontend users/auth repositories. It rejects legacy `success`/`error` wrappers and missing `meta`. Do not add fallback parsing. Registration maps `errors[].field` to the form; classroom action-link redemption reads the classroom from `data`.

The generated [OpenAPI schema](../../backend/schema.yml) documents named response objects. OAuth protocol endpoints outside `/api/v1`, media downloads, streams, and webhooks are unchanged. No database migration is required. Roll back the frontend and backend together if necessary.
