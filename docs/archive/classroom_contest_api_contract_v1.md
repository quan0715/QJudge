# Classroom Contest API Contract v1

Status: Draft (for implementation alignment)
Owner: Classroom/Contest module
Date: 2026-03-26

## Summary
- Contest creation and management authority is classroom-scoped.
- New/updated management flows must provide classroom context.
- Standalone contests are kept for compatibility in v1, but classroom-bound contests are authoritative.

## Core Rules
1. Contest authority source
- `is_classroom_bound = true`: authority comes from classroom role (`owner/manager/student`).
- `is_classroom_bound = false`: fallback to legacy contest role model (`owner/co_owner/participant`).

2. Binding operations
- `bind_contest` and `unbind_contest` are **platform admin only**.

3. Admin-management endpoints on bound contests
- `GET /contests/{id}/admins/`
- `POST /contests/{id}/add_admin/`
- `POST /contests/{id}/remove_admin/`
- If contest is classroom-bound, always return `403 contest_managed_by_classroom`.

4. Contest settings UI behavior
- `is_classroom_bound=true`: hide contest admin/personnel list in settings, show readonly notice.
- `is_classroom_bound=false`: keep legacy admin/personnel management UI.

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

## Error Code Registry
- `contest_managed_by_classroom`:
  - Meaning: contest personnel is controlled by classroom, contest-level admin mutation blocked.
  - HTTP: `403`

## Compatibility Notes
- No data migration required for v1.
- Standalone contests continue to work.
- Classroom-bound behavior applies immediately after binding.

