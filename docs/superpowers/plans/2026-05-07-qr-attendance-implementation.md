# QJudge QR Attendance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build QR-based exam attendance check-in/check-out with projection QR, app-only scanner, attendance photo evidence, start gate enforcement, teacher-assisted fallback, and attendance evidence review inside existing Overview participant management.

**Architecture:** Attendance is a contest subdomain implemented alongside existing exam event/evidence APIs. It does not modify `ExamStatus`; backend computes attendance state from `ExamEvent` and `ExamEvidenceFrame`. Frontend owns projection, scanner/capture, dashboard attendance CTAs, and participant-detail attendance UI in the contest feature layer while repositories/mappers stay in infrastructure.

**Tech Stack:** Django REST Framework, Django cache-backed short-lived tokens, PostgreSQL migrations, React 19, Carbon React, `@rc-component/qrcode`, browser `BarcodeDetector`, Vitest/RTL, pytest.

**Reference spec:** `docs/superpowers/specs/2026-05-07-qr-attendance-design.md`

---

## File Structure

Backend:

- Modify `backend/apps/contests/models.py`: remove contest password field/helpers; add contest attendance toggle, attendance event types, attendance evidence source.
- Create `backend/apps/contests/migrations/0078_attendance_qr.py`: schema migration.
- Create `backend/apps/contests/services/attendance.py`: cache-backed token generation, status builder, participant attendance builder, event creation helpers.
- Create `backend/apps/contests/views/attendance.py`: DRF mixin/actions for QR token and unified attendance event creation.
- Modify `backend/apps/contests/views/contest.py`: remove password join verification and registration password handling.
- Modify `backend/apps/contests/views/exam_lifecycle.py`: enforce attendance check-in before start.
- Modify `backend/apps/contests/views/exam_evidence.py`: allow attendance evidence in `not_started`; keep anti-cheat evidence restrictions.
- Modify `backend/apps/contests/services/exam_submission.py`: allow `attendance` source module without falling back to `screen_share`.
- Modify `backend/apps/contests/serializers.py`: add attendance setting to contest serializers; remove password write path.
- Add tests under `backend/apps/contests/tests/attendance/`.

Frontend:

- Modify `frontend/package.json` and lockfile: add `@rc-component/qrcode`.
- Modify `frontend/src/core/entities/contest.entity.ts`: add attendance fields/types and remove password-facing contest fields.
- Modify `frontend/src/infrastructure/api/dto/contest.dto.ts` and `frontend/src/infrastructure/mappers/contest.mapper.ts`: map attendance DTOs.
- Create `frontend/src/infrastructure/api/repositories/attendance.repository.ts`: QR token and unified attendance event calls.
- Create `frontend/src/features/contest/attendance/`: scanner parsing, camera capture helpers, attendance view models.
- Create admin projection components under `frontend/src/features/contest/screens/admin/attendance/`.
- Extend existing Overview participant management components for attendance review and teacher-assisted actions.
- Modify admin access settings to replace password UI with attendance QR toggle.
- Modify student dashboard to surface attendance status and scanner CTAs.
- Modify contest routes to add projection and student scanner routes.

Quality:

- Add or update targeted tests near changed backend/frontend files.
- Run backend targeted pytest, frontend targeted vitest, `tsc -b`, Carbon style gate, architecture lint.

---

## Phase 1: Backend Data Model and Password Removal

### Task 1: Add attendance schema and remove contest password schema

**Files:**

- Modify: `backend/apps/contests/models.py`
- Create: `backend/apps/contests/migrations/0078_attendance_qr.py`
- Test: `backend/apps/contests/tests/attendance/test_attendance_models.py`

- [ ] **Step 1: Write model expectation tests**

Create `backend/apps/contests/tests/attendance/test_attendance_models.py`:

```python
import pytest

from apps.contests.models import Contest, ExamEvent, ExamEvidenceFrame


@pytest.mark.django_db
def test_contest_attendance_check_defaults_to_disabled(user_factory):
    teacher = user_factory(role="teacher")
    contest = Contest.objects.create(owner=teacher, name="Exam")

    assert contest.attendance_check_enabled is False


def test_contest_password_field_removed():
    field_names = {field.name for field in Contest._meta.fields}

    assert "password" not in field_names
    assert not hasattr(Contest, "verify_contest_password")
    assert not hasattr(Contest, "set_contest_password")


def test_attendance_event_types_are_registered():
    choices = {value for value, _label in ExamEvent.EVENT_TYPE_CHOICES}

    assert "attendance_check_in" in choices
    assert "attendance_check_out" in choices


def test_attendance_is_valid_evidence_source_module():
    choices = {value for value, _label in ExamEvidenceFrame.SourceModule.choices}

    assert "attendance" in choices
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
cd backend && pytest apps/contests/tests/attendance/test_attendance_models.py -q
```

Expected: fail because `attendance_check_enabled` and `attendance` source do not exist, and `Contest.password` still exists.

- [ ] **Step 3: Modify models**

In `backend/apps/contests/models.py`:

Remove these contest password members:

```python
password = models.CharField(...)

def set_contest_password(...)
def verify_contest_password(...)
def has_hashed_password(...)

@property
def requires_password(...)
```

Remove password hasher imports that become unused:

```python
from django.contrib.auth.hashers import check_password, identify_hasher, make_password
```

```python
class Contest(models.Model):
    ...
    attendance_check_enabled = models.BooleanField(
        default=False,
        verbose_name="啟用 QR 簽到",
        help_text="啟用後，學生必須完成現場 QR 簽到與照片上傳才可開始作答",
    )
```

Add event choices to `ExamEvent.EVENT_TYPE_CHOICES`:

```python
("attendance_check_in", "Attendance Check In"),
("attendance_check_out", "Attendance Check Out"),
```

Add source module:

```python
class SourceModule(models.TextChoices):
    SCREEN_SHARE = "screen_share", "Screen Share"
    WEBCAM = "webcam", "Webcam"
    ATTENDANCE = "attendance", "Attendance"
```

- [ ] **Step 4: Create migration**

Create `backend/apps/contests/migrations/0078_attendance_qr.py`:

```python
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("contests", "0077_remove_contest_anonymous_mode"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="contest",
            name="password",
        ),
        migrations.AddField(
            model_name="contest",
            name="attendance_check_enabled",
            field=models.BooleanField(
                default=False,
                help_text="啟用後，學生必須完成現場 QR 簽到與照片上傳才可開始作答",
                verbose_name="啟用 QR 簽到",
            ),
        ),
        migrations.AlterField(
            model_name="examevent",
            name="event_type",
            field=models.CharField(
                choices=[
                    ("tab_hidden", "Tab Hidden"),
                    ("window_blur", "Window Blur"),
                    ("exit_fullscreen", "Exit Fullscreen"),
                    ("forbidden_focus_event", "Forbidden Focus Event"),
                    ("forbidden_action", "Forbidden Action"),
                    ("multiple_displays", "Multiple Displays"),
                    ("mouse_leave", "Mouse Leave"),
                    ("warning_timeout", "Warning Timeout"),
                    ("force_submit_locked", "Force Submit Locked"),
                    ("screen_share_stopped", "Screen Share Stopped"),
                    ("screen_share_interrupted", "Screen Share Interrupted"),
                    ("screen_share_restored", "Screen Share Restored"),
                    ("screen_share_invalid_surface", "Screen Share Invalid Surface"),
                    ("webcam_interrupted", "Webcam Interrupted"),
                    ("webcam_restored", "Webcam Restored"),
                    ("webcam_stopped", "Webcam Stopped"),
                    ("webcam_quality_degraded", "Webcam Quality Degraded"),
                    ("viewport_interrupted", "Viewport Interrupted"),
                    ("viewport_restored", "Viewport Restored"),
                    ("viewport_stopped", "Viewport Stopped"),
                    ("split_view_detected", "Split View Detected"),
                    ("capture_upload_degraded", "Capture Upload Degraded"),
                    ("exam_entered", "Exam Entered"),
                    ("exam_submit_initiated", "Exam Submit Initiated"),
                    ("concurrent_login_detected", "Concurrent Login Detected"),
                    ("heartbeat", "Heartbeat"),
                    ("heartbeat_timeout", "Heartbeat Timeout"),
                    ("listener_tampered", "Listener Tampered"),
                    ("exit_fullscreen_triggered", "Exit Fullscreen Triggered"),
                    ("mouse_leave_triggered", "Mouse Leave Triggered"),
                    ("tab_hidden_triggered", "Tab Hidden Triggered"),
                    ("tab_hidden_restored", "Tab Hidden Restored"),
                    ("window_blur_triggered", "Window Blur Triggered"),
                    ("window_blur_restored", "Window Blur Restored"),
                    ("multi_display_triggered", "Multi Display Triggered"),
                    ("multi_display_restored", "Multi Display Restored"),
                    ("display_api_degraded", "Display API Degraded"),
                    ("clipboard_action", "Clipboard Action"),
                    ("attendance_check_in", "Attendance Check In"),
                    ("attendance_check_out", "Attendance Check Out"),
                ],
                max_length=50,
                verbose_name="事件類型",
            ),
        ),
        migrations.AlterField(
            model_name="examevidenceframe",
            name="source_module",
            field=models.CharField(
                choices=[
                    ("screen_share", "Screen Share"),
                    ("webcam", "Webcam"),
                    ("attendance", "Attendance"),
                ],
                default="screen_share",
                max_length=20,
            ),
        ),
    ]
```

- [ ] **Step 5: Run tests**

Run:

```bash
cd backend && pytest apps/contests/tests/attendance/test_attendance_models.py -q
```

Expected: pass.

### Task 2: Remove contest password API behavior

**Files:**

- Modify: `backend/apps/contests/serializers.py`
- Modify: `backend/apps/contests/views/contest.py`
- Modify: `frontend/src/infrastructure/api/dto/contest.dto.ts`
- Modify: `frontend/src/infrastructure/mappers/contest.mapper.ts`
- Test: `backend/apps/contests/tests/attendance/test_password_removed.py`

- [ ] **Step 1: Write backend tests**

Create `backend/apps/contests/tests/attendance/test_password_removed.py`:

```python
import pytest


@pytest.mark.django_db
def test_register_does_not_require_legacy_password(api_client, classroom_factory, contest_factory, user_factory):
    teacher = user_factory(role="teacher")
    student = user_factory(role="student")
    classroom = classroom_factory(owner=teacher)
    classroom.memberships.create(user=student, role="student")
    contest = contest_factory(
        owner=teacher,
        status="published",
        visibility="private",
    )
    contest.classroom_bindings.create(classroom=classroom)

    api_client.force_authenticate(student)
    response = api_client.post(f"/api/v1/contests/{contest.id}/register/", {}, format="json")

    assert response.status_code == 201


@pytest.mark.django_db
def test_contest_update_ignores_password_payload(api_client, contest_factory, user_factory):
    teacher = user_factory(role="teacher")
    contest = contest_factory(owner=teacher, status="draft", visibility="public")

    api_client.force_authenticate(teacher)
    response = api_client.patch(
        f"/api/v1/contests/{contest.id}/",
        {"password": "new-password", "requires_password": True},
        format="json",
    )

    assert response.status_code == 200
    assert "requires_password" not in response.data
    assert "password" not in response.data
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
cd backend && pytest apps/contests/tests/attendance/test_password_removed.py -q
```

Expected: fail because password verification, serializer fields, and response fields still exist.

- [ ] **Step 3: Remove backend password behavior**

In `backend/apps/contests/serializers.py`:

- Remove `password` and `requires_password` from `ContestCreateUpdateSerializer.Meta.fields`.
- Remove `requires_password` from `ContestDetailSerializer.fields`.
- Remove `requires_password = serializers.BooleanField(read_only=True)` from `ContestDetailSerializer`.
- Remove `extra_kwargs["password"]`.
- Remove `requires_password = serializers.BooleanField(...)`.
- Remove `_resolve_requires_password`.
- Remove password validation from `validate`.
- Remove password handling from `create` and `update`; both should call `super()` directly.

In `backend/apps/contests/views/contest.py`:

- Delete `_verify_contest_join_password`.
- Remove calls to `_verify_contest_join_password` from `register` and `enter`.

- [ ] **Step 4: Remove frontend password DTO/mapping writes**

In `frontend/src/infrastructure/api/dto/contest.dto.ts`, remove:

```typescript
requires_password?: boolean;
password?: string;
```

from contest DTO/request shapes.

In `frontend/src/infrastructure/mappers/contest.mapper.ts`, remove these outgoing keys from `mapContestRequestToDto`:

```typescript
requires_password: ...
password: request.password,
```

- [ ] **Step 5: Run tests**

Run:

```bash
cd backend && pytest apps/contests/tests/attendance/test_password_removed.py -q
cd frontend && npx tsc -b --pretty false
```

Expected: backend tests pass. Frontend typecheck may point out remaining password references; remove them in Task 16 before final gates.

---

## Phase 2: Attendance Service and API

### Task 3: Implement attendance service

**Files:**

- Create: `backend/apps/contests/services/attendance.py`
- Test: `backend/apps/contests/tests/attendance/test_attendance_service.py`

- [ ] **Step 1: Write service tests**

Create `backend/apps/contests/tests/attendance/test_attendance_service.py`:

```python
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.contests.models import ContestParticipant, ExamEvidenceFrame, ExamEvent, ExamStatus
from apps.contests.services.attendance import (
    ATTENDANCE_TOKEN_MAX_AGE_SECONDS,
    build_attendance_status,
    create_attendance_token,
    parse_attendance_qr_value,
    validate_attendance_token,
)


@pytest.mark.django_db
def test_token_round_trip(contest_factory):
    contest = contest_factory()
    token = create_attendance_token(contest, "check_in")

    payload = validate_attendance_token(contest, "check_in", token)

    assert payload["contest_id"] == str(contest.id)
    assert payload["purpose"] == "check_in"


@pytest.mark.django_db
def test_token_rejects_wrong_purpose(contest_factory):
    contest = contest_factory()
    token = create_attendance_token(contest, "check_in")

    with pytest.raises(ValueError, match="invalid_attendance_token"):
        validate_attendance_token(contest, "check_out", token)


def test_parse_attendance_qr_value():
    parsed = parse_attendance_qr_value("qj-att:v1:check_in:abc.def")

    assert parsed == {"purpose": "check_in", "token": "abc.def"}


@pytest.mark.django_db
def test_attendance_status_allows_late_not_started_student(contest_factory, user_factory):
    student = user_factory(role="student")
    contest = contest_factory(attendance_check_enabled=True, start_time=timezone.now() - timedelta(minutes=15))
    participant = ContestParticipant.objects.create(contest=contest, user=student, exam_status=ExamStatus.NOT_STARTED)

    status = build_attendance_status(contest, participant)

    assert status["canCheckIn"] is True
    assert status["canStartExam"] is False


@pytest.mark.django_db
def test_attendance_status_allows_start_after_confirmed_check_in(contest_factory, user_factory):
    student = user_factory(role="student")
    contest = contest_factory(attendance_check_enabled=True, start_time=timezone.now() - timedelta(minutes=1))
    participant = ContestParticipant.objects.create(contest=contest, user=student, exam_status=ExamStatus.NOT_STARTED)
    event = ExamEvent.objects.create(contest=contest, user=student, event_type="attendance_check_in", metadata={})
    ExamEvidenceFrame.objects.create(
        contest=contest,
        user=student,
        exam_event=event,
        source_module=ExamEvidenceFrame.SourceModule.ATTENDANCE,
        status=ExamEvidenceFrame.Status.UPLOADED,
    )

    status = build_attendance_status(contest, participant)

    assert status["checkInStatus"] == "photo_confirmed"
    assert status["canStartExam"] is True
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
cd backend && pytest apps/contests/tests/attendance/test_attendance_service.py -q
```

Expected: fail because service does not exist.

- [ ] **Step 3: Implement service**

Create `backend/apps/contests/services/attendance.py`:

```python
from __future__ import annotations

import secrets
from typing import Any

from django.core import signing
from django.utils import timezone

from apps.contests.models import Contest, ContestParticipant, ExamEvidenceFrame, ExamEvent, ExamStatus

ATTENDANCE_QR_PREFIX = "qj-att"
ATTENDANCE_QR_VERSION = "v1"
ATTENDANCE_TOKEN_MAX_AGE_SECONDS = 45
ATTENDANCE_REFRESH_SECONDS = 30
ATTENDANCE_PURPOSES = {"check_in", "check_out"}
ATTENDANCE_EVENT_TYPES = {
    "check_in": "attendance_check_in",
    "check_out": "attendance_check_out",
}


def create_attendance_token(contest: Contest, purpose: str) -> str:
    if purpose not in ATTENDANCE_PURPOSES:
        raise ValueError("invalid_attendance_purpose")
    payload = {
        "contest_id": str(contest.id),
        "purpose": purpose,
        "issued_at": timezone.now().isoformat(),
        "nonce": secrets.token_urlsafe(16),
    }
    return signing.dumps(payload, salt="qjudge.attendance")


def build_attendance_qr_value(purpose: str, token: str) -> str:
    if purpose not in ATTENDANCE_PURPOSES:
        raise ValueError("invalid_attendance_purpose")
    return f"{ATTENDANCE_QR_PREFIX}:{ATTENDANCE_QR_VERSION}:{purpose}:{token}"


def parse_attendance_qr_value(value: str) -> dict[str, str]:
    parts = str(value or "").split(":", 3)
    if len(parts) != 4:
        raise ValueError("invalid_attendance_qr")
    prefix, version, purpose, token = parts
    if prefix != ATTENDANCE_QR_PREFIX or version != ATTENDANCE_QR_VERSION:
        raise ValueError("invalid_attendance_qr")
    if purpose not in ATTENDANCE_PURPOSES or not token:
        raise ValueError("invalid_attendance_qr")
    return {"purpose": purpose, "token": token}


def validate_attendance_token(contest: Contest, purpose: str, token: str) -> dict[str, Any]:
    try:
        payload = signing.loads(
            token,
            salt="qjudge.attendance",
            max_age=ATTENDANCE_TOKEN_MAX_AGE_SECONDS,
        )
    except signing.SignatureExpired as exc:
        raise ValueError("expired_attendance_token") from exc
    except signing.BadSignature as exc:
        raise ValueError("invalid_attendance_token") from exc

    if payload.get("contest_id") != str(contest.id) or payload.get("purpose") != purpose:
        raise ValueError("invalid_attendance_token")
    return payload


def _latest_attendance_event(contest: Contest, participant: ContestParticipant, event_type: str):
    return (
        ExamEvent.objects.filter(contest=contest, user=participant.user, event_type=event_type)
        .order_by("-created_at")
        .first()
    )


def _event_has_uploaded_attendance_photo(event: ExamEvent | None) -> bool:
    if event is None:
        return False
    return ExamEvidenceFrame.objects.filter(
        contest=event.contest,
        user=event.user,
        exam_event=event,
        source_module=ExamEvidenceFrame.SourceModule.ATTENDANCE,
        status=ExamEvidenceFrame.Status.UPLOADED,
    ).exists()


def _status_for_event(event: ExamEvent | None) -> str:
    if event is None:
        return "missing"
    metadata = event.metadata if isinstance(event.metadata, dict) else {}
    if metadata.get("attendance_mode") == "teacher_assisted":
        return "teacher_assisted"
    return "photo_confirmed" if _event_has_uploaded_attendance_photo(event) else "event_created"


def build_attendance_status(contest: Contest, participant: ContestParticipant | None) -> dict[str, Any]:
    required = bool(getattr(contest, "attendance_check_enabled", False))
    if not required:
        return {
            "attendanceRequired": False,
            "checkInStatus": "photo_confirmed",
            "checkOutStatus": "unavailable",
            "canCheckIn": False,
            "canStartExam": True,
            "canCheckOut": False,
        }
    if participant is None:
        return {
            "attendanceRequired": True,
            "checkInStatus": "missing",
            "checkOutStatus": "unavailable",
            "canCheckIn": True,
            "canStartExam": False,
            "canCheckOut": False,
        }

    check_in_event = _latest_attendance_event(contest, participant, "attendance_check_in")
    check_out_event = _latest_attendance_event(contest, participant, "attendance_check_out")
    check_in_status = _status_for_event(check_in_event)
    check_out_status = "unavailable"
    if participant.exam_status == ExamStatus.SUBMITTED:
        check_out_status = _status_for_event(check_out_event)

    now = timezone.now()
    start_ready = contest.start_time is None or now >= contest.start_time
    attendance_ready = check_in_status in {"photo_confirmed", "teacher_assisted"}
    return {
        "attendanceRequired": True,
        "checkInStatus": check_in_status,
        "checkOutStatus": check_out_status,
        "canCheckIn": participant.exam_status == ExamStatus.NOT_STARTED,
        "canStartExam": attendance_ready and start_ready,
        "canCheckOut": participant.exam_status == ExamStatus.SUBMITTED,
    }


def create_attendance_event(contest: Contest, actor, data: dict[str, Any], ensure_participant) -> dict[str, Any]:
    mode = data["mode"]
    purpose = data["purpose"]
    if mode == "student_self_scan":
        if data.get("user_id"):
            raise ValueError("user_id_forbidden_for_self_scan")
        token = str(data.get("token") or "")
        if not token:
            raise ValueError("attendance_token_required")
        validate_attendance_token(contest, purpose, token)
        participant, _created, error_response = ensure_participant(contest, actor)
        if error_response is not None:
            return {"error_response": error_response}
        if participant is None:
            raise ValueError("not_registered")
        if purpose == "check_in" and participant.exam_status != ExamStatus.NOT_STARTED:
            return {"error_code": "check_in_only_before_personal_start"}
        if purpose == "check_out" and participant.exam_status != ExamStatus.SUBMITTED:
            return {"error_code": "checkout_not_available_until_submitted"}
        target_user = actor
        metadata = {
            "attendance_purpose": purpose,
            "attendance_mode": "student_self_scan",
            "source_module": "attendance",
            "device_kind": data.get("device_kind") or "",
            "client_observed_at_ms": data.get("client_observed_at_ms"),
            "photo_required": True,
        }
    elif mode == "teacher_assisted":
        if not actor.has_perm("contests.change_contest") and contest.owner_id != actor.id and not contest.admins.filter(id=actor.id).exists():
            raise ValueError("attendance_teacher_permission_required")
        if data.get("token"):
            raise ValueError("token_forbidden_for_teacher_assisted")
        if not data.get("user_id"):
            raise ValueError("user_id_required")
        if not str(data.get("reason") or "").strip():
            raise ValueError("reason_required")
        participant = ContestParticipant.objects.select_related("user").get(contest=contest, user_id=data["user_id"])
        target_user = participant.user
        metadata = {
            "attendance_purpose": purpose,
            "attendance_mode": "teacher_assisted",
            "assisted_by_user_id": actor.id,
            "assisted_by_username": actor.username,
            "reason": str(data["reason"]).strip(),
            "source_module": "attendance",
            "photo_required": True,
        }
    else:
        raise ValueError("invalid_attendance_mode")

    event = ExamEvent.objects.create(
        contest=contest,
        user=target_user,
        event_type=ATTENDANCE_EVENT_TYPES[purpose],
        metadata=metadata,
    )
    return {
        "payload": {
            "event_id": event.id,
            "purpose": purpose,
            "source_module": "attendance",
            "evidence_cluster_id": f"attendance-{event.id}",
            "recorded_at": event.created_at.isoformat(),
            "attendance_status": build_attendance_status(contest, participant),
        }
    }
```

- [ ] **Step 4: Run tests**

Run:

```bash
cd backend && pytest apps/contests/tests/attendance/test_attendance_service.py -q
```

Expected: pass.

### Task 4: Implement attendance API mixin

**Files:**

- Create: `backend/apps/contests/views/attendance.py`
- Modify: `backend/apps/contests/views/contest.py`
- Test: `backend/apps/contests/tests/attendance/test_attendance_api.py`

- [ ] **Step 1: Write API tests**

Create `backend/apps/contests/tests/attendance/test_attendance_api.py` with tests for:

```python
@pytest.mark.django_db
def test_teacher_can_get_qr_token(api_client, contest_factory, user_factory):
    teacher = user_factory(role="teacher")
    contest = contest_factory(owner=teacher, attendance_check_enabled=True)
    api_client.force_authenticate(teacher)

    response = api_client.get(f"/api/v1/contests/{contest.id}/attendance/qr-token/?purpose=check_in")

    assert response.status_code == 200
    assert response.data["purpose"] == "check_in"
    assert response.data["qr_value"].startswith("qj-att:v1:check_in:")
    assert response.data["refresh_after_seconds"] == 30
    assert response.data["expires_in_seconds"] == 45


@pytest.mark.django_db
def test_student_cannot_get_qr_token(api_client, contest_factory, user_factory):
    teacher = user_factory(role="teacher")
    student = user_factory(role="student")
    contest = contest_factory(owner=teacher, attendance_check_enabled=True)
    api_client.force_authenticate(student)

    response = api_client.get(f"/api/v1/contests/{contest.id}/attendance/qr-token/?purpose=check_in")

    assert response.status_code == 403
```

Create the following additional tests in the same file:

```python
@pytest.mark.django_db
def test_student_can_check_in_while_not_started(api_client, contest_factory, user_factory):
    teacher = user_factory(role="teacher")
    student = user_factory(role="student")
    contest = contest_factory(owner=teacher, attendance_check_enabled=True)
    ContestParticipant.objects.create(contest=contest, user=student, exam_status=ExamStatus.NOT_STARTED)
    token = create_attendance_token(contest, "check_in")

    api_client.force_authenticate(student)
    response = api_client.post(
        f"/api/v1/contests/{contest.id}/attendance/events/",
        {"mode": "student_self_scan", "purpose": "check_in", "token": token, "device_kind": "mobile"},
        format="json",
    )

    assert response.status_code == 201
    assert ExamEvent.objects.filter(contest=contest, user=student, event_type="attendance_check_in").exists()


@pytest.mark.django_db
@pytest.mark.parametrize("exam_status", [ExamStatus.IN_PROGRESS, ExamStatus.PAUSED, ExamStatus.LOCKED])
def test_scan_rejected_while_exam_runtime(api_client, contest_factory, user_factory, exam_status):
    student = user_factory(role="student")
    contest = contest_factory(attendance_check_enabled=True)
    ContestParticipant.objects.create(contest=contest, user=student, exam_status=exam_status)
    token = create_attendance_token(contest, "check_in")

    api_client.force_authenticate(student)
    response = api_client.post(
        f"/api/v1/contests/{contest.id}/attendance/events/",
        {"mode": "student_self_scan", "purpose": "check_in", "token": token},
        format="json",
    )

    assert response.status_code == 409
    assert response.data["code"] == "check_in_only_before_personal_start"


@pytest.mark.django_db
def test_checkout_rejected_before_submitted(api_client, contest_factory, user_factory):
    student = user_factory(role="student")
    contest = contest_factory(attendance_check_enabled=True)
    ContestParticipant.objects.create(contest=contest, user=student, exam_status=ExamStatus.NOT_STARTED)
    token = create_attendance_token(contest, "check_out")

    api_client.force_authenticate(student)
    response = api_client.post(
        f"/api/v1/contests/{contest.id}/attendance/events/",
        {"mode": "student_self_scan", "purpose": "check_out", "token": token},
        format="json",
    )

    assert response.status_code == 409
    assert response.data["code"] == "checkout_not_available_until_submitted"


@pytest.mark.django_db
def test_checkout_accepted_after_submitted(api_client, contest_factory, user_factory):
    student = user_factory(role="student")
    contest = contest_factory(attendance_check_enabled=True)
    ContestParticipant.objects.create(contest=contest, user=student, exam_status=ExamStatus.SUBMITTED)
    token = create_attendance_token(contest, "check_out")

    api_client.force_authenticate(student)
    response = api_client.post(
        f"/api/v1/contests/{contest.id}/attendance/events/",
        {"mode": "student_self_scan", "purpose": "check_out", "token": token},
        format="json",
    )

    assert response.status_code == 201
    assert ExamEvent.objects.filter(contest=contest, user=student, event_type="attendance_check_out").exists()


@pytest.mark.django_db
def test_invalid_attendance_token_returns_code(api_client, contest_factory, user_factory):
    student = user_factory(role="student")
    contest = contest_factory(attendance_check_enabled=True)
    ContestParticipant.objects.create(contest=contest, user=student, exam_status=ExamStatus.NOT_STARTED)

    api_client.force_authenticate(student)
    response = api_client.post(
        f"/api/v1/contests/{contest.id}/attendance/events/",
        {"mode": "student_self_scan", "purpose": "check_in", "token": "invalid"},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["code"] == "invalid_attendance_token"
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
cd backend && pytest apps/contests/tests/attendance/test_attendance_api.py -q
```

Expected: fail because routes/actions do not exist.

- [ ] **Step 3: Implement view mixin**

Create `backend/apps/contests/views/attendance.py`:

```python
from django.utils import timezone
from rest_framework import permissions, serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.contests.permissions import can_manage_contest
from apps.contests.services.attendance import (
    ATTENDANCE_REFRESH_SECONDS,
    ATTENDANCE_TOKEN_MAX_AGE_SECONDS,
    ATTENDANCE_EVENT_TYPES,
    build_attendance_qr_value,
    create_attendance_event,
    create_attendance_token,
)


class AttendanceEventSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=("student_self_scan", "teacher_assisted"))
    purpose = serializers.ChoiceField(choices=("check_in", "check_out"))
    token = serializers.CharField(required=False, allow_blank=True)
    user_id = serializers.IntegerField(required=False, min_value=1)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=200)
    client_observed_at_ms = serializers.IntegerField(required=False, min_value=0)
    device_kind = serializers.CharField(required=False, allow_blank=True, max_length=32)


class AttendanceMixin:
    @action(detail=True, methods=["get"], permission_classes=[permissions.IsAuthenticated], url_path="attendance/qr-token")
    def attendance_qr_token(self, request, pk=None):
        contest = self.get_object()
        if not can_manage_contest(request.user, contest):
            return Response({"detail": "You do not have permission to perform this action."}, status=403)
        purpose = request.query_params.get("purpose")
        if purpose not in ATTENDANCE_EVENT_TYPES:
            return Response({"code": "invalid_attendance_purpose"}, status=400)
        token = create_attendance_token(contest, purpose)
        return Response(
            {
                "purpose": purpose,
                "token": token,
                "qr_value": build_attendance_qr_value(purpose, token),
                "refresh_after_seconds": ATTENDANCE_REFRESH_SECONDS,
                "expires_in_seconds": ATTENDANCE_TOKEN_MAX_AGE_SECONDS,
                "expires_at": (timezone.now() + timezone.timedelta(seconds=ATTENDANCE_TOKEN_MAX_AGE_SECONDS)).isoformat(),
            }
        )

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated], url_path="attendance/events")
    def attendance_events(self, request, pk=None):
        contest = self.get_object()
        if not contest.attendance_check_enabled:
            return Response({"code": "attendance_not_enabled"}, status=status.HTTP_400_BAD_REQUEST)
        serializer = AttendanceEventSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = create_attendance_event(
                contest=contest,
                actor=request.user,
                data=serializer.validated_data,
                ensure_participant=self._ensure_classroom_bound_participant,
            )
        except ValueError as exc:
            code = str(exc)
            if code == "attendance_teacher_permission_required":
                return Response({"code": code}, status=status.HTTP_403_FORBIDDEN)
            return Response({"code": code}, status=status.HTTP_400_BAD_REQUEST)
        error_response = result.get("error_response")
        if error_response is not None:
            return error_response
        if result.get("error_code") in {"check_in_only_before_personal_start", "checkout_not_available_until_submitted"}:
            return Response({"code": result["error_code"]}, status=status.HTTP_409_CONFLICT)
        return Response(result["payload"], status=status.HTTP_201_CREATED)
```

The view must not contain mode-specific attendance rules beyond serializer validation and permission response mapping. Mode dispatch belongs in `services/attendance.py`.

- [ ] **Step 4: Wire mixin into ContestViewSet**

In `backend/apps/contests/views/contest.py`:

```python
from .attendance import AttendanceMixin


class ContestViewSet(AttendanceMixin, viewsets.ModelViewSet):
    ...
```

- [ ] **Step 5: Run tests**

Run:

```bash
cd backend && pytest apps/contests/tests/attendance/test_attendance_api.py -q
```

Expected: token/status/student event tests pass; assisted-event tests can be added after their task.

---

## Phase 3: Evidence Upload and Start Gate

### Task 5: Allow attendance evidence in not_started

**Files:**

- Modify: `backend/apps/contests/views/exam_evidence.py`
- Modify: `backend/apps/contests/serializers.py`
- Modify: `backend/apps/contests/services/exam_submission.py`
- Test: `backend/apps/contests/tests/attendance/test_attendance_evidence.py`

- [ ] **Step 1: Write tests**

Create `backend/apps/contests/tests/attendance/test_attendance_evidence.py`:

```python
import pytest

from apps.contests.models import ContestParticipant, ExamEvent, ExamStatus
from apps.contests.services.evidence_windows import attach_evidence_window_metadata


@pytest.mark.django_db
def test_attendance_evidence_upload_intent_allowed_before_exam_start(api_client, contest_factory, user_factory):
    student = user_factory(role="student")
    contest = contest_factory(attendance_check_enabled=True)
    ContestParticipant.objects.create(contest=contest, user=student, exam_status=ExamStatus.NOT_STARTED)
    event = ExamEvent.objects.create(contest=contest, user=student, event_type="attendance_check_in", metadata={})

    api_client.force_authenticate(student)
    response = api_client.post(
        f"/api/v1/contests/{contest.id}/exam/evidence/upload-intents/",
        {
            "event_id": event.id,
            "source_module": "attendance",
            "evidence_mode": "audit",
            "frames": [{"client_captured_at_ms": 1778100750000, "seq": 1}],
        },
        format="json",
    )

    assert response.status_code == 201


@pytest.mark.django_db
def test_non_attendance_evidence_still_rejected_before_exam_start(api_client, contest_factory, user_factory):
    student = user_factory(role="student")
    contest = contest_factory(attendance_check_enabled=True)
    ContestParticipant.objects.create(contest=contest, user=student, exam_status=ExamStatus.NOT_STARTED)
    event = ExamEvent.objects.create(contest=contest, user=student, event_type="screen_share_stopped", metadata={})
    event = attach_evidence_window_metadata(event)

    api_client.force_authenticate(student)
    response = api_client.post(
        f"/api/v1/contests/{contest.id}/exam/evidence/upload-intents/",
        {
            "event_id": event.id,
            "source_module": "screen_share",
            "evidence_mode": "anchor_window",
            "frames": [{"client_captured_at_ms": 1778100750000, "seq": 1}],
        },
        format="json",
    )

    assert response.status_code == 400
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
cd backend && pytest apps/contests/tests/attendance/test_attendance_evidence.py -q
```

Expected: attendance upload rejected before exam start.

- [ ] **Step 3: Update serializers and validation**

In `backend/apps/contests/serializers.py`, extend `EvidenceUploadIntentSerializer.source_module` choices by relying on `ExamEvidenceFrame.SourceModule.choices` after adding `attendance`.

In `backend/apps/contests/views/exam_evidence.py`, add helper:

```python
def _is_attendance_evidence_event(event: ExamEvent, source_module: str) -> bool:
    return (
        source_module == ExamEvidenceFrame.SourceModule.ATTENDANCE
        and event.event_type in {"attendance_check_in", "attendance_check_out"}
    )
```

Modify `_validate_evidence_participant` to accept `event` and `source_module`. The accepted behavior must be:

```python
if participant.exam_status == ExamStatus.NOT_STARTED and _is_attendance_evidence_event(event, source_module):
    allow upload
else:
    keep existing MONITORED_STATUSES | SUBMITTED requirement
```

In `backend/apps/contests/services/exam_submission.py`, update `normalize_source_module` so:

```python
if source_module == "attendance":
    return "attendance"
```

- [ ] **Step 4: Run tests**

Run:

```bash
cd backend && pytest apps/contests/tests/attendance/test_attendance_evidence.py -q
```

Expected: pass.

### Task 6: Enforce attendance check-in before start_exam

**Files:**

- Modify: `backend/apps/contests/views/exam_lifecycle.py`
- Test: `backend/apps/contests/tests/attendance/test_attendance_start_gate.py`

- [ ] **Step 1: Write tests**

Create `backend/apps/contests/tests/attendance/test_attendance_start_gate.py`:

```python
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.contests.models import ContestParticipant, ExamEvidenceFrame, ExamEvent, ExamStatus


@pytest.mark.django_db
def test_start_exam_requires_attendance_photo(api_client, contest_factory, user_factory):
    student = user_factory(role="student")
    contest = contest_factory(
        attendance_check_enabled=True,
        status="published",
        start_time=timezone.now() - timedelta(minutes=1),
        end_time=timezone.now() + timedelta(hours=1),
    )
    ContestParticipant.objects.create(contest=contest, user=student, exam_status=ExamStatus.NOT_STARTED)

    api_client.force_authenticate(student)
    response = api_client.post(f"/api/v1/contests/{contest.id}/exam/start/", {}, format="json")

    assert response.status_code == 403
    assert response.data["code"] == "attendance_check_in_required"


@pytest.mark.django_db
def test_start_exam_allowed_after_attendance_photo(api_client, contest_factory, user_factory):
    student = user_factory(role="student")
    contest = contest_factory(
        attendance_check_enabled=True,
        status="published",
        start_time=timezone.now() - timedelta(minutes=1),
        end_time=timezone.now() + timedelta(hours=1),
    )
    participant = ContestParticipant.objects.create(contest=contest, user=student, exam_status=ExamStatus.NOT_STARTED)
    event = ExamEvent.objects.create(contest=contest, user=student, event_type="attendance_check_in", metadata={})
    ExamEvidenceFrame.objects.create(
        contest=contest,
        user=student,
        exam_event=event,
        source_module=ExamEvidenceFrame.SourceModule.ATTENDANCE,
        status=ExamEvidenceFrame.Status.UPLOADED,
    )

    api_client.force_authenticate(student)
    response = api_client.post(f"/api/v1/contests/{contest.id}/exam/start/", {}, format="json")

    assert response.status_code == 200
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
cd backend && pytest apps/contests/tests/attendance/test_attendance_start_gate.py -q
```

Expected: first test fails because start is not gated.

- [ ] **Step 3: Implement gate**

In `backend/apps/contests/views/exam_lifecycle.py`, after participant existence and locked/submitted checks but before active device session:

```python
from apps.contests.services.attendance import build_attendance_status

...
if contest.attendance_check_enabled:
    attendance_status = build_attendance_status(contest, participant)
    if not attendance_status["canStartExam"]:
        return Response(
            {
                "code": "attendance_check_in_required",
                "message": "Attendance check-in photo is required before starting the exam.",
                "attendance_status": attendance_status,
            },
            status=status.HTTP_403_FORBIDDEN,
        )
```

Do not change `ExamStatus` values.

- [ ] **Step 4: Run tests**

Run:

```bash
cd backend && pytest apps/contests/tests/attendance/test_attendance_start_gate.py -q
```

Expected: pass.

---

## Phase 4: Participant Attendance and Assisted Fallback

### Task 7: Participant dashboard attendance payload

**Files:**

- Modify: `backend/apps/contests/services/attendance.py`
- Modify: `backend/apps/contests/services/participant_dashboard.py`
- Test: `backend/apps/contests/tests/attendance/test_participant_dashboard_attendance.py`

- [ ] **Step 1: Write participant dashboard attendance tests**

Create `backend/apps/contests/tests/attendance/test_participant_dashboard_attendance.py`:

```python
@pytest.mark.django_db
def test_participant_dashboard_includes_attendance_status(api_client, contest_factory, user_factory):
    teacher = user_factory(role="teacher")
    student = user_factory(role="student", username="student_a")
    contest = contest_factory(owner=teacher, attendance_check_enabled=True)
    participant = ContestParticipant.objects.create(contest=contest, user=student)
    event = ExamEvent.objects.create(contest=contest, user=student, event_type="attendance_check_in", metadata={})
    ExamEvidenceFrame.objects.create(
        contest=contest,
        user=student,
        exam_event=event,
        source_module=ExamEvidenceFrame.SourceModule.ATTENDANCE,
        status=ExamEvidenceFrame.Status.UPLOADED,
    )

    api_client.force_authenticate(teacher)
    response = api_client.get(f"/api/v1/contests/{contest.id}/participant_dashboard/{student.id}/")

    assert response.status_code == 200
    assert response.data["attendance"]["status"]["checkInStatus"] == "photo_confirmed"
    assert response.data["attendance"]["events"][0]["purpose"] == "check_in"
    assert response.data["attendance"]["events"][0]["evidence_count"] == 1
```

Add explicit tests for submitted participant missing checkout and teacher-assisted event:

```python
@pytest.mark.django_db
def test_participant_dashboard_marks_missing_checkout(api_client, contest_factory, user_factory):
    teacher = user_factory(role="teacher")
    student = user_factory(role="student")
    contest = contest_factory(owner=teacher, attendance_check_enabled=True)
    ContestParticipant.objects.create(contest=contest, user=student, exam_status=ExamStatus.SUBMITTED)

    api_client.force_authenticate(teacher)
    response = api_client.get(f"/api/v1/contests/{contest.id}/participant_dashboard/{student.id}/")

    assert response.status_code == 200
    assert "missing_check_out" in response.data["attendance"]["anomalies"]
```

- [ ] **Step 2: Implement participant attendance builder**

In `backend/apps/contests/services/attendance.py`, add:

```python
ANOMALY_ORDER = {
    "missing_check_in": 10,
    "check_in_photo_missing": 20,
    "missing_check_out": 30,
    "check_out_photo_missing": 40,
    "time_anomaly": 50,
    "teacher_assisted": 60,
    "normal": 90,
}


def build_participant_attendance_summary(contest: Contest, participant: ContestParticipant) -> dict[str, Any]:
    status = build_attendance_status(contest, participant)
    anomalies: list[str] = []
    if status["checkInStatus"] == "missing":
        anomalies.append("missing_check_in")
    elif status["checkInStatus"] == "event_created":
        anomalies.append("check_in_photo_missing")
    if participant.exam_status == ExamStatus.SUBMITTED:
        if status["checkOutStatus"] == "missing":
            anomalies.append("missing_check_out")
        elif status["checkOutStatus"] == "event_created":
            anomalies.append("check_out_photo_missing")
    if status["checkInStatus"] == "teacher_assisted" or status["checkOutStatus"] == "teacher_assisted":
        anomalies.append("teacher_assisted")
    if not anomalies:
        anomalies.append("normal")

    events = []
    for event in ExamEvent.objects.filter(
        contest=contest,
        user=participant.user,
        event_type__in=["attendance_check_in", "attendance_check_out"],
    ).order_by("created_at"):
        metadata = event.metadata if isinstance(event.metadata, dict) else {}
        evidence_count = ExamEvidenceFrame.objects.filter(
            contest=contest,
            user=participant.user,
            exam_event=event,
            source_module=ExamEvidenceFrame.SourceModule.ATTENDANCE,
            status=ExamEvidenceFrame.Status.UPLOADED,
        ).count()
        events.append(
            {
                "event_id": event.id,
                "purpose": "check_out" if event.event_type == "attendance_check_out" else "check_in",
                "recorded_at": event.created_at.isoformat(),
                "mode": metadata.get("attendance_mode") or "student_self_scan",
                "evidence_count": evidence_count,
                "metadata": metadata,
            }
        )

    return {
        "status": status,
        "events": events,
        "anomalies": sorted(anomalies, key=lambda item: ANOMALY_ORDER[item]),
    }
```

- [ ] **Step 3: Add participant dashboard payload**

In `backend/apps/contests/services/participant_dashboard.py`, import and attach the summary:

```python
from apps.contests.services.attendance import build_participant_attendance_summary

payload = {
    ...
    "attendance": build_participant_attendance_summary(contest, participant),
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
cd backend && pytest apps/contests/tests/attendance/test_participant_dashboard_attendance.py -q
```

Expected: pass.

### Task 8: Teacher-assisted fallback through unified events

**Files:**

- Modify: `backend/apps/contests/services/attendance.py`
- Modify: `backend/apps/contests/views/attendance.py`
- Test: `backend/apps/contests/tests/attendance/test_attendance_assisted.py`

- [ ] **Step 1: Write unified assisted event tests**

Create `backend/apps/contests/tests/attendance/test_attendance_assisted.py`:

```python
@pytest.mark.django_db
def test_teacher_assisted_check_in_creates_event(api_client, contest_factory, user_factory):
    teacher = user_factory(role="teacher")
    student = user_factory(role="student")
    contest = contest_factory(owner=teacher, attendance_check_enabled=True)
    ContestParticipant.objects.create(contest=contest, user=student)

    api_client.force_authenticate(teacher)
    response = api_client.post(
        f"/api/v1/contests/{contest.id}/attendance/events/",
        {
            "mode": "teacher_assisted",
            "user_id": student.id,
            "purpose": "check_in",
            "reason": "student camera unavailable",
        },
        format="json",
    )

    assert response.status_code == 201
    event = ExamEvent.objects.get(id=response.data["event_id"])
    assert event.event_type == "attendance_check_in"
    assert event.metadata["attendance_mode"] == "teacher_assisted"
    assert event.metadata["assisted_by_user_id"] == teacher.id
```

- [ ] **Step 2: Implement the teacher-assisted branch**

Do not add a separate endpoint. Extend the unified attendance event serializer and `create_attendance_event(...)` service:

```python
if mode == "teacher_assisted":
    # teacher/admin only
    # token is forbidden
    # user_id and reason are required
    # event metadata must include attendance_mode, assisted_by_user_id, reason
```

`POST /attendance/events/` remains the only event creation endpoint. The view should delegate to the service and map `attendance_teacher_permission_required` to 403.

- [ ] **Step 3: Run tests**

Run:

```bash
cd backend && pytest apps/contests/tests/attendance/test_attendance_assisted.py -q
```

Expected: pass.

---

## Phase 5: Frontend Infrastructure

### Task 9: Add dependencies and API repository

**Files:**

- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/src/infrastructure/api/repositories/attendance.repository.ts`
- Modify: `frontend/src/infrastructure/api/repositories/index.ts`
- Test: `frontend/src/infrastructure/api/repositories/attendance.repository.test.ts`

- [ ] **Step 1: Install dependencies**

Run:

```bash
cd frontend && npm install @rc-component/qrcode
```

Expected: `package.json` and `package-lock.json` updated.

- [ ] **Step 2: Create repository types and functions**

Create `frontend/src/infrastructure/api/repositories/attendance.repository.ts`:

```typescript
import { httpClient, requestJson } from "@/infrastructure/api/http.client";

export type AttendancePurpose = "check_in" | "check_out";
export type AttendanceCheckInStatus = "missing" | "event_created" | "photo_confirmed" | "teacher_assisted";
export type AttendanceCheckOutStatus = "unavailable" | AttendanceCheckInStatus;

export interface AttendanceStatusDto {
  attendanceRequired: boolean;
  checkInStatus: AttendanceCheckInStatus;
  checkOutStatus: AttendanceCheckOutStatus;
  canCheckIn: boolean;
  canStartExam: boolean;
  canCheckOut: boolean;
}

export interface AttendanceQrTokenDto {
  purpose: AttendancePurpose;
  token: string;
  qr_value: string;
  refresh_after_seconds: number;
  expires_in_seconds: number;
  expires_at: string;
}

export interface AttendanceEventResponseDto {
  event_id: number;
  purpose: AttendancePurpose;
  source_module: "attendance";
  evidence_cluster_id: string;
  recorded_at: string;
  attendance_status: AttendanceStatusDto;
}

export const getAttendanceQrToken = async (
  contestId: string,
  purpose: AttendancePurpose,
): Promise<AttendanceQrTokenDto> => {
  return requestJson<AttendanceQrTokenDto>(
    httpClient.get(`/api/v1/contests/${contestId}/attendance/qr-token/?purpose=${purpose}`),
    "Failed to fetch attendance QR token",
  );
};

export const createAttendanceEvent = async (
  contestId: string,
  payload:
    | {
        mode: "student_self_scan";
        purpose: AttendancePurpose;
        token: string;
        client_observed_at_ms?: number;
        device_kind?: string;
      }
    | {
        mode: "teacher_assisted";
        purpose: AttendancePurpose;
        user_id: string | number;
        reason: string;
      },
): Promise<AttendanceEventResponseDto> => {
  return requestJson<AttendanceEventResponseDto>(
    httpClient.post(`/api/v1/contests/${contestId}/attendance/events/`, payload),
    "Failed to create attendance event",
  );
};
```

Export it from `frontend/src/infrastructure/api/repositories/index.ts`.

- [ ] **Step 3: Run typecheck**

Run:

```bash
cd frontend && npx tsc -b --pretty false
```

Expected: pass after resolving export conflicts.

### Task 10: Attendance QR parser and scanner view model

**Files:**

- Create: `frontend/src/features/contest/attendance/attendanceQr.ts`
- Test: `frontend/src/features/contest/attendance/attendanceQr.test.ts`

- [ ] **Step 1: Write parser tests**

Create `frontend/src/features/contest/attendance/attendanceQr.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parseAttendanceQrValue } from "./attendanceQr";

describe("parseAttendanceQrValue", () => {
  it("parses check-in payload", () => {
    expect(parseAttendanceQrValue("qj-att:v1:check_in:abc.def")).toEqual({
      purpose: "check_in",
      token: "abc.def",
    });
  });

  it("rejects normal urls", () => {
    expect(parseAttendanceQrValue("https://example.com")).toBeNull();
  });
});
```

- [ ] **Step 2: Implement parser**

Create `frontend/src/features/contest/attendance/attendanceQr.ts`:

```typescript
import type { AttendancePurpose } from "@/infrastructure/api/repositories/attendance.repository";

export interface ParsedAttendanceQr {
  purpose: AttendancePurpose;
  token: string;
}

export const parseAttendanceQrValue = (value: string): ParsedAttendanceQr | null => {
  const parts = value.split(":");
  if (parts.length < 4) return null;
  const [prefix, version, purpose, ...tokenParts] = parts;
  const token = tokenParts.join(":");
  if (prefix !== "qj-att" || version !== "v1") return null;
  if (purpose !== "check_in" && purpose !== "check_out") return null;
  if (!token) return null;
  return { purpose, token };
};
```

- [ ] **Step 3: Run tests**

Run:

```bash
cd frontend && npm test -- attendanceQr.test.ts
```

Expected: pass.

---

## Phase 6: Admin UI

### Task 11: Replace password settings with QR attendance setting

**Files:**

- Modify: `frontend/src/features/contest/components/admin/settings/AccessSettingsPanel.tsx`
- Modify: `frontend/src/features/contest/screens/admin/panels/AdminContestSettingsScreen.tsx`
- Test: `frontend/src/features/contest/components/admin/settings/AccessSettingsPanel.test.tsx`

- [ ] **Step 1: Write UI tests**

Test expectations:

- password input is not rendered
- `settings-attendance-check-enabled` toggle is rendered
- toggling calls `onChange("attendanceCheckEnabled", true)`

- [ ] **Step 2: Implement setting**

In `AccessSettingsPanel.tsx`, remove `settings-requires-password` and `settings-password` blocks. Add:

```tsx
<ActionRow
  label={t("settings.attendanceCheckEnabled", "現場 QR 簽到")}
  description={t(
    "settings.attendanceCheckEnabledHelp",
    "啟用後，學生必須在競賽主頁使用 QJudge 掃描器完成簽到與照片上傳，才可開始作答。",
  )}
  saveState={getState("attendanceCheckEnabled")}
  onRetry={() => onRetry("attendanceCheckEnabled")}
>
  <Toggle
    id="settings-attendance-check-enabled"
    labelText=""
    hideLabel
    labelA={tc("toggle.disable")}
    labelB={tc("toggle.enable")}
    toggled={!!form.attendanceCheckEnabled}
    onToggle={(checked) => onChange("attendanceCheckEnabled", checked)}
  />
</ActionRow>
```

In `AdminContestSettingsScreen.tsx`, initialize form:

```typescript
attendanceCheckEnabled: contest.attendanceCheckEnabled ?? false,
```

- [ ] **Step 3: Run tests/typecheck**

Run:

```bash
cd frontend && npm test -- AccessSettingsPanel.test.tsx
cd frontend && npx tsc -b --pretty false
```

### Task 12: Projection page

**Files:**

- Create: `frontend/src/features/contest/screens/admin/attendance/AttendanceProjectionScreen.tsx`
- Create: `frontend/src/features/contest/screens/admin/attendance/AttendanceProjectionScreen.module.scss`
- Create: `frontend/src/features/contest/screens/admin/attendance/useAttendanceQrToken.ts`
- Modify: `frontend/src/features/contest/routes.tsx`
- Test: `frontend/src/features/contest/screens/admin/attendance/AttendanceProjectionScreen.test.tsx`

- [ ] **Step 1: Write hook and screen tests**

Tests cover:

- two QR cards render with Check-in and Check-out
- QR values come from repository response
- countdown label renders `45`
- refetch interval uses 30 seconds with fake timers

- [ ] **Step 2: Implement hook**

Create `useAttendanceQrToken.ts`:

```typescript
import { useEffect, useState } from "react";
import { getAttendanceQrToken, type AttendancePurpose, type AttendanceQrTokenDto } from "@/infrastructure/api/repositories/attendance.repository";

export const useAttendanceQrToken = (contestId: string, purpose: AttendancePurpose) => {
  const [data, setData] = useState<AttendanceQrTokenDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof window.setTimeout> | null = null;
    const load = async () => {
      setLoading(true);
      try {
        const next = await getAttendanceQrToken(contestId, purpose);
        if (cancelled) return;
        setData(next);
        setError(null);
        timer = window.setTimeout(load, next.refresh_after_seconds * 1000);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to fetch attendance QR token");
        timer = window.setTimeout(load, 10_000);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [contestId, purpose]);

  return { data, loading, error };
};
```

- [ ] **Step 3: Implement screen**

Use Carbon components and tokens; do not override `.cds--*`. Use `@rc-component/qrcode`:

```tsx
import QRCode from "@rc-component/qrcode";
```

Each card renders:

```tsx
<QRCode value={data?.qr_value ?? "qj-att:v1:check_in:loading"} size={240} />
```

The page should not depend on shared UI. Keep it in `features/contest/screens/admin/attendance`.

- [ ] **Step 4: Wire route**

Add admin route:

```tsx
<Route path="admin/attendance/projection" element={<AttendanceProjectionScreen />} />
```

- [ ] **Step 5: Run checks**

Run:

```bash
cd frontend && npm test -- AttendanceProjectionScreen.test.tsx
bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh frontend/src/features/contest/screens/admin/attendance
```

---

## Phase 7: Student Scanner and Dashboard

### Task 13: Student scanner and capture flow

**Files:**

- Create: `frontend/src/features/contest/screens/attendance/StudentAttendanceScanScreen.tsx`
- Create: `frontend/src/features/contest/screens/attendance/StudentAttendanceScanScreen.module.scss`
- Create: `frontend/src/features/contest/screens/attendance/useQrScanner.ts`
- Create: `frontend/src/features/contest/screens/attendance/useAttendanceCapture.ts`
- Modify: `frontend/src/features/contest/routes.tsx`
- Test: `frontend/src/features/contest/screens/attendance/StudentAttendanceScanScreen.test.tsx`

- [ ] **Step 1: Write UI tests**

Tests cover:

- invalid QR displays invalid message
- valid QR calls `createAttendanceEvent`
- after event creation, capture submit calls `createEvidenceUploadIntent`, uploads blob, then `confirmEvidenceUpload`
- submitted success state displays recorded time

- [ ] **Step 2: Implement scanner loop**

Use `navigator.mediaDevices.getUserMedia` and browser `BarcodeDetector` for QR detection. Unsupported browsers display the teacher-assisted fallback message.

The scanner starts camera preview, stops tracks on unmount, and passes detected QR text to `parseAttendanceQrValue`.

- [ ] **Step 3: Implement capture hook**

Capture one frame from `<video>` to canvas:

```typescript
canvas.toBlob((blob) => resolve(blob), "image/webp", 0.9);
```

Then:

1. `createAttendanceEvent(contestId, { mode: "student_self_scan", purpose, token, client_observed_at_ms: Date.now(), device_kind: "mobile" })`
2. `createEvidenceUploadIntent(contestId, { event_id, evidence_cluster_id, source_module: "attendance", evidence_mode: "audit", frames: [{ client_captured_at_ms: Date.now(), seq: 1 }] })`
3. `fetch(put_url, { method: "PUT", headers, body: blob })`
4. `confirmEvidenceUpload(contestId, { event_id, upload_session_id, frames: [{ evidence_frame_id, object_key, byte_size: blob.size }] })`

- [ ] **Step 4: Implement route**

Add:

```tsx
<Route path="attendance/scan" element={<StudentAttendanceScanScreen />} />
```

- [ ] **Step 5: Run checks**

Run:

```bash
cd frontend && npm test -- StudentAttendanceScanScreen.test.tsx attendanceQr.test.ts
cd frontend && npx tsc -b --pretty false
```

### Task 14: Student dashboard attendance gates

**Files:**

- Modify: `frontend/src/features/contest/components/studentDashboard/StudentContestDashboardView.tsx`
- Modify: `frontend/src/features/contest/components/studentDashboard/studentDashboardState.ts`
- Test: `frontend/src/features/contest/components/studentDashboard/StudentContestDashboardView.test.tsx`

- [ ] **Step 1: Add tests**

Add cases:

- attendance required and missing check-in disables start and shows scanner CTA
- check-in confirmed before `start_time` shows waiting countdown
- late student after `start_time` with confirmed check-in sees start CTA
- in progress does not show scanner CTA
- submitted missing checkout shows checkout scanner CTA

- [ ] **Step 2: Implement state model**

Extend dashboard state with:

```typescript
attendanceRequired: boolean;
checkInStatus: "missing" | "event_created" | "photo_confirmed" | "teacher_assisted";
checkOutStatus: "unavailable" | "missing" | "event_created" | "photo_confirmed" | "teacher_assisted";
canCheckIn: boolean;
canStartExam: boolean;
canCheckOut: boolean;
```

Start action should use backend `canStartExam` when attendance is required. Do not infer from `ExamStatus`.

- [ ] **Step 3: Implement UI**

Add a divider-based section above actions:

- Missing check-in: `開啟簽到掃描器`
- Confirmed check-in before start: `已完成簽到`
- Submitted missing checkout: `開啟簽退掃描器`

Use Carbon Button, Tag, InlineLoading where needed. Do not use password modal.

- [ ] **Step 4: Run tests**

Run:

```bash
cd frontend && npm test -- StudentContestDashboardView.test.tsx
```

---

## Phase 8: Overview Participant Attendance UI

### Task 15: Participant dashboard attendance section

**Files:**

- Modify: `frontend/src/core/entities/contest.entity.ts`
- Modify: `frontend/src/infrastructure/api/dto/contest.dto.ts`
- Modify: `frontend/src/infrastructure/mappers/contest.mapper.ts`
- Modify: `frontend/src/infrastructure/api/repositories/attendance.repository.ts`
- Modify: `frontend/src/features/contest/components/participants/ParticipantDashboardPane.tsx`
- Modify: `frontend/src/features/contest/components/participants/ParticipantOperationsPane.tsx`
- Modify: `frontend/src/features/contest/components/admin/AdminOverviewCommandCenter.tsx`
- Test: `frontend/src/features/contest/components/participants/ParticipantDashboardPane.test.tsx`
- Test: `frontend/src/features/contest/components/participants/ParticipantOperationsPane.test.tsx`

- [ ] **Step 1: Add participant dashboard attendance types and mapper**

Add to contest entity/DTO/mappers:

```typescript
export interface ParticipantAttendanceEvent {
  eventId: string;
  purpose: "check_in" | "check_out";
  recordedAt: string;
  mode: "student_self_scan" | "teacher_assisted";
  evidenceCount: number;
  metadata: Record<string, unknown>;
}

export interface ParticipantAttendanceSummary {
  status: AttendanceStatus;
  events: ParticipantAttendanceEvent[];
  anomalies: string[];
}
```

- [ ] **Step 2: Use the unified attendance event repository function**

In `attendance.repository.ts`, do not add a separate assisted endpoint helper. Reuse `createAttendanceEvent` with the teacher-assisted mode:

```typescript
await createAttendanceEvent(contestId, {
  mode: "teacher_assisted",
  purpose,
  user_id: participantUserId,
  reason,
});
```

- [ ] **Step 3: Implement participant attendance UI**

In `ParticipantDashboardPane.tsx`, add `attendance` as a detail option when dashboard payload includes attendance. Render:

- status block for check-in/check-out
- anomaly tags
- attendance event list
- expandable photo evidence area using existing `fetchScreenshots` with `source_module=attendance`

- [ ] **Step 4: Implement teacher-assisted actions**

In `ParticipantOperationsPane.tsx`, add actions:

- `教師協助簽到`
- `教師協助簽退`

Each opens a Carbon modal requiring a reason. Submit calls `createAttendanceEvent` with `mode: "teacher_assisted"`, then refreshes the participant dashboard.

In `AdminOverviewCommandCenter.tsx`, keep attendance inside the selected participant detail; do not add an admin route or sidebar item.

- [ ] **Step 5: Run tests**

Run:

```bash
cd frontend && npm test -- ParticipantDashboardPane.test.tsx ParticipantOperationsPane.test.tsx
```

---

## Phase 9: Final Removal and Quality Gates

### Task 16: Remove remaining password UI/code

**Files:**

- Delete or simplify: `frontend/src/features/contest/components/modals/ContestRegistrationModal.tsx`
- Modify: `frontend/src/features/contest/hooks/useContestExamActions.ts`
- Modify: `frontend/src/infrastructure/api/repositories/contest.repository.ts`
- Modify tests referencing password registration.

- [ ] **Step 1: Search for password join references**

Run:

```bash
rg -n "requiresPassword|requires_password|registration-password|joinPassword|password\\?: string|registerContest\\([^)]*password" frontend/src backend/apps/contests -S
```

Expected: only non-contest auth password references remain.

- [ ] **Step 2: Remove frontend registration password path**

`registerContest` should no longer accept `{ password?: string }`. Update callers to call `registerContest(id)` only.

Student dashboard should open attendance scanner for attendance-required contests, not `ContestRegistrationModal`.

- [ ] **Step 3: Run regression tests**

Run:

```bash
cd frontend && npm test -- StudentContestDashboardView.test.tsx ContestPreviewCard
cd backend && pytest apps/contests/tests/management/test_contest_viewset_actions.py -q
```

Expected: tests updated to QR attendance behavior; no password gate assertions remain.

### Task 17: Full targeted gates

**Files:** all touched files.

- [ ] **Step 1: Backend tests**

Run:

```bash
cd backend && pytest apps/contests/tests/attendance apps/contests/tests/exam/test_exam_permissions.py apps/contests/tests/test_exam_anticheat.py -q
```

Expected: pass.

- [ ] **Step 2: Frontend tests**

Run:

```bash
cd frontend && npm test -- attendance StudentContestDashboardView.test.tsx AccessSettingsPanel.test.tsx
```

Expected: pass.

- [ ] **Step 3: Typecheck**

Run:

```bash
cd frontend && npx tsc -b --pretty false
```

Expected: pass.

- [ ] **Step 4: Carbon style gate**

Run:

```bash
bash .codex/skills/qjudge-quality-gates-owner/scripts/check-carbon-style.sh frontend/src/features/contest/screens/admin/attendance frontend/src/features/contest/screens/attendance frontend/src/features/contest/components/studentDashboard
```

Expected: pass; no `.cds--*`, `.bx--*`, or `!important` violations.

- [ ] **Step 5: Architecture lint**

Run:

```bash
node .codex/skills/qjudge-quality-gates-owner/scripts/lint-architecture.js --root frontend/src
```

Expected: pass. If it fails, move cross-feature logic to `core` or `infrastructure`; do not import feature UI from shared.

- [ ] **Step 6: Manual smoke**

Run local dev stack, then verify:

- teacher projection page renders QR tokens and refresh countdown
- student dashboard missing check-in blocks start
- scanner accepts only `qj-att:` QR
- late not-started student can check in after global start time
- submitted student can check out
- Overview participant detail shows missing checkout anomaly

## Self-review

- Spec coverage: covered teacher projection, app-only scanner, late students, no `ExamStatus` changes, password removal, QR short lifetime, evidence upload exception, fallback, and Overview participant attendance review.
- Placeholder scan: no open-ended implementation placeholders remain; follow-up cleanup is expressed as explicit search and removal task.
- Type consistency: backend uses snake_case DTO/API fields; frontend repository preserves API DTO names and maps to UI state in feature code.
