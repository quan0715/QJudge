# Classroom Contest API Contract v1

Status: Draft (for implementation alignment)
Owner: Classroom/Contest module
Date: 2026-03-26

## Summary
- Contest creation and management authority is classroom-scoped.
- New/updated management flows must provide classroom context.
- **Production invariant:** every contest must have at least one classroom binding (`ClassroomContest`). Unbound contests are rejected by participation and roster APIs (use `python manage.py audit_contest_classroom_bindings` before deploy).

## Core Rules
1. Contest authority source
- `is_classroom_bound = true`: authority comes from classroom role (`owner/manager/student`) for roster and visibility; co-admin / manual roster on the contest API are disabled (`403 contest_managed_by_classroom`).
- `is_classroom_bound = false`: treated as **invalid** for `register`, `enter`, `GET|POST .../admins/`, `add_admin`, `remove_admin`, `add_participant`, `remove_participant` — respond with `400 contest_requires_classroom_binding`. Detail retrieval and other endpoints may still work for migration/debug only.

2. Binding operations
- `bind_contest` and `unbind_contest` are **platform admin only**.

3. Admin-management and manual roster endpoints
- `GET /contests/{id}/admins/`
- `POST /contests/{id}/add_admin/`
- `POST /contests/{id}/remove_admin/`
- `POST /contests/{id}/add_participant/`
- `POST /contests/{id}/remove_participant/`
- If contest has **no** classroom binding: `400 contest_requires_classroom_binding`.
- If contest **is** classroom-bound: `403 contest_managed_by_classroom` (manage people via classroom).

4. Contest settings UI behavior
- `is_classroom_bound=true`: hide contest admin/personnel list in settings, show readonly notice.
- `is_classroom_bound=false`: **should not occur in production**; UI should not expose legacy roster/co-admin flows for orphan contests.

## API Surfaces

### A) Existing endpoints with behavior updates

#### `POST /api/v1/classrooms/{classroomId}/bind_contest/`
- Permission: platform admin only.
- Request:
```json
{ "contest_id": "<contest_uuid>" }
```
- Success:
  - `201` when newly bound
  - `200`/`201`-style existing behavior allowed if already bound
- Errors:
  - `403` permission denied
  - `404` contest/classroom not found

#### `POST /api/v1/classrooms/{classroomId}/unbind_contest/`
- Permission: platform admin only.
- Request:
```json
{ "contest_id": "<contest_uuid>" }
```
- Success: `200`
- Errors:
  - `403` permission denied
  - `404` binding not found

#### `GET /api/v1/contests/{contestId}/admins/`
#### `POST /api/v1/contests/{contestId}/add_admin/`
#### `POST /api/v1/contests/{contestId}/remove_admin/`
#### `POST /api/v1/contests/{contestId}/add_participant/`
#### `POST /api/v1/contests/{contestId}/remove_participant/`
- If **not** classroom-bound:
```json
{
  "error": {
    "code": "contest_requires_classroom_binding",
    "message": "This contest must be bound to a classroom.",
    "type": "validation_error"
  }
}
```
- Status: `400`
- If classroom-bound:
```json
{
  "error": {
    "code": "contest_managed_by_classroom",
    "message": "This contest is managed by a classroom. Update members in classroom.",
    "type": "permission_denied"
  }
}
```
- Status: `403`

### B) Contest detail payload additions
`GET /api/v1/contests/{contestId}/`
```json
{
  "...": "...",
  "is_classroom_bound": true,
  "bound_classroom_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```
- `bound_classroom_id = null` when not bound.
- If multiple bindings exist, return deterministic primary binding (current rule: earliest `bound_at`).

## Recommended Next API (v1.1)
For full classroom-context creation (not implemented in this v1 patch):
- `POST /api/v1/classrooms/{classroomId}/contests`
  - Creates contest and binds in one transaction.
  - Authorization based on classroom role (`owner/manager`) + platform admin override.

#### `POST /api/v1/contests/{contestId}/register/`
#### `POST /api/v1/contests/{contestId}/enter/`
- Require a classroom binding and classroom membership (or staff role where applicable). If `requires_password` is true, body must include correct `password` or response is `403` with `Invalid password`.
- Unbound contest: `400 contest_requires_classroom_binding`.

#### Contest list (`GET /api/v1/contests/`, `scope=visible`)
- Anonymous users: **no** published contests returned (empty list).
- Authenticated: contests visible when the user is owner, co-admin, participant, or has a classroom relationship to a bound contest; `visibility` field still filters as before.

## Error Code Registry
- `contest_requires_classroom_binding`:
  - Meaning: contest has no `ClassroomContest` row; bind before participation or roster changes.
  - HTTP: `400`
- `contest_managed_by_classroom`:
  - Meaning: contest personnel is controlled by classroom, contest-level admin/roster mutation blocked.
  - HTTP: `403`

## Compatibility Notes
- Deploy after auditing DB for orphan contests (`audit_contest_classroom_bindings`).
- `requires_password` and `visibility` remain on the model; password applies on the classroom-bound `register`/`enter` path after membership checks.

