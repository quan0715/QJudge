"""Service-level tests for the attendance domain helpers."""
from __future__ import annotations

from datetime import timedelta
from unittest import mock

import pytest
from django.core.cache import cache
from django.utils import timezone

from apps.contests.models import (
    Contest,
    ContestParticipant,
    ExamEvent,
    ExamEvidenceFrame,
    ExamStatus,
)
from apps.contests.services import attendance as svc
from apps.users.models import User


def _make_user(username: str, role: str = "student") -> User:
    return User.objects.create_user(
        username=username,
        email=f"{username}@example.com",
        password="testpass123",
        role=role,
    )


def _make_contest(owner: User, **overrides) -> Contest:
    now = timezone.now()
    defaults = {
        "name": "Attendance Service Test",
        "owner": owner,
        "status": "published",
        "visibility": "public",
        "start_time": now - timedelta(minutes=5),
        "end_time": now + timedelta(hours=1),
        "attendance_check_enabled": True,
    }
    defaults.update(overrides)
    return Contest.objects.create(**defaults)


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.mark.django_db
class TestCredentialValidation:
    def test_refresh_interval_matches_attendance_credential_lifetime(self) -> None:
        assert svc.ATTENDANCE_REFRESH_SECONDS == 60
        assert svc.ATTENDANCE_TOKEN_MAX_AGE_SECONDS == 60

    def test_token_validates_when_cache_payload_matches(self) -> None:
        owner = _make_user("svc_token_owner", role="teacher")
        contest = _make_contest(owner)
        credential = svc.create_attendance_credential(contest, "check_in")

        payload = svc.validate_attendance_token(contest, "check_in", credential["token"])
        assert payload["purpose"] == "check_in"
        assert payload["token"] == credential["token"]

    def test_token_raises_when_cache_expires(self) -> None:
        owner = _make_user("svc_token_expiry_owner", role="teacher")
        contest = _make_contest(owner)
        credential = svc.create_attendance_credential(contest, "check_in")

        cache.delete(svc._token_cache_key(credential["token"]))

        with pytest.raises(ValueError, match="invalid_attendance_token"):
            svc.validate_attendance_token(contest, "check_in", credential["token"])

    def test_token_raises_for_purpose_mismatch(self) -> None:
        owner = _make_user("svc_token_purpose_owner", role="teacher")
        contest = _make_contest(owner)
        credential = svc.create_attendance_credential(contest, "check_in")

        with pytest.raises(ValueError, match="invalid_attendance_token"):
            svc.validate_attendance_token(contest, "check_out", credential["token"])

    def test_manual_code_raises_when_cache_expires(self) -> None:
        owner = _make_user("svc_manual_expiry_owner", role="teacher")
        contest = _make_contest(owner)
        credential = svc.create_attendance_credential(contest, "check_in")

        cache.delete(svc._manual_code_cache_key(credential["manual_code"]))

        with pytest.raises(ValueError, match="invalid_attendance_manual_code"):
            svc.validate_attendance_manual_code(
                contest, "check_in", credential["manual_code"]
            )

    def test_manual_code_validates_when_payload_present(self) -> None:
        owner = _make_user("svc_manual_owner", role="teacher")
        contest = _make_contest(owner)
        credential = svc.create_attendance_credential(contest, "check_in")

        payload = svc.validate_attendance_manual_code(
            contest, "check_in", credential["manual_code"]
        )
        assert payload["purpose"] == "check_in"

    def test_new_credential_invalidates_previous_token_and_manual_code(self) -> None:
        owner = _make_user("svc_refresh_owner", role="teacher")
        contest = _make_contest(owner)
        first = svc.create_attendance_credential(contest, "check_in")
        second = svc.create_attendance_credential(contest, "check_in")

        with pytest.raises(ValueError, match="invalid_attendance_token"):
            svc.validate_attendance_token(contest, "check_in", first["token"])
        with pytest.raises(ValueError, match="invalid_attendance_manual_code"):
            svc.validate_attendance_manual_code(contest, "check_in", first["manual_code"])

        payload = svc.validate_attendance_token(contest, "check_in", second["token"])
        assert payload["manual_code"] == second["manual_code"]
        payload = svc.validate_attendance_manual_code(contest, "check_in", second["manual_code"])
        assert payload["token"] == second["token"]

    def test_manual_code_raises_for_wrong_length(self) -> None:
        owner = _make_user("svc_manual_len_owner", role="teacher")
        contest = _make_contest(owner)

        with pytest.raises(ValueError, match="invalid_attendance_manual_code"):
            svc.validate_attendance_manual_code(contest, "check_in", "12345")


@pytest.mark.django_db
class TestManualCodeCollisionRetry:
    def test_retries_when_first_code_collides(self) -> None:
        owner = _make_user("svc_collision_owner", role="teacher")
        contest = _make_contest(owner)
        cache.set(
            svc._manual_code_cache_key("000000"),
            {"purpose": "check_in", "contest_id": "other"},
            timeout=svc.ATTENDANCE_TOKEN_MAX_AGE_SECONDS,
        )

        codes = iter(["000000", "111111"])
        with mock.patch.object(svc, "_generate_attendance_manual_code", side_effect=lambda: next(codes)):
            credential = svc.create_attendance_credential(contest, "check_in")

        assert credential["manual_code"] == "111111"

    def test_raises_when_all_attempts_collide(self) -> None:
        owner = _make_user("svc_collision_fail_owner", role="teacher")
        contest = _make_contest(owner)
        cache.set(
            svc._manual_code_cache_key("999999"),
            {"purpose": "check_in", "contest_id": "other"},
            timeout=svc.ATTENDANCE_TOKEN_MAX_AGE_SECONDS,
        )

        with mock.patch.object(svc, "_generate_attendance_manual_code", return_value="999999"):
            with pytest.raises(ValueError, match="attendance_manual_code_generation_failed"):
                svc.create_attendance_credential(contest, "check_in")


@pytest.mark.django_db
class TestBuildAttendanceStatusMultipleEvents:
    def _make_attendance_event(
        self,
        contest: Contest,
        user: User,
        *,
        event_type: str,
        photo_kind: str | None = "room",
    ) -> ExamEvent:
        event = ExamEvent.objects.create(
            contest=contest,
            user=user,
            event_type=event_type,
            metadata={"attendance_purpose": event_type.replace("attendance_", "")},
        )
        if photo_kind:
            ExamEvidenceFrame.objects.create(
                contest=contest,
                user=user,
                exam_event=event,
                source_module=ExamEvidenceFrame.SourceModule.ATTENDANCE,
                status=ExamEvidenceFrame.Status.UPLOADED,
                seq=1,
            )
        return event

    def test_latest_event_with_photo_wins_when_newer_event_lacks_photo(self) -> None:
        owner = _make_user("svc_status_owner", role="teacher")
        student = _make_user("svc_status_student")
        contest = _make_contest(owner)
        participant = ContestParticipant.objects.create(
            contest=contest, user=student, exam_status=ExamStatus.NOT_STARTED
        )

        # First attempt: photo confirmed.
        self._make_attendance_event(
            contest, student, event_type="attendance_check_in", photo_kind="room"
        )
        # Second attempt (newer): photo missing.
        self._make_attendance_event(
            contest, student, event_type="attendance_check_in", photo_kind=None
        )

        status = svc.build_attendance_status(contest, participant)
        assert status["checkInStatus"] == "photo_confirmed"

    def test_falls_back_to_latest_status_when_no_event_is_ready(self) -> None:
        owner = _make_user("svc_status_unready_owner", role="teacher")
        student = _make_user("svc_status_unready_student")
        contest = _make_contest(owner)
        participant = ContestParticipant.objects.create(
            contest=contest, user=student, exam_status=ExamStatus.NOT_STARTED
        )
        self._make_attendance_event(
            contest, student, event_type="attendance_check_in", photo_kind=None
        )
        self._make_attendance_event(
            contest, student, event_type="attendance_check_in", photo_kind=None
        )

        status = svc.build_attendance_status(contest, participant)
        assert status["checkInStatus"] == "event_created"


@pytest.mark.django_db
class TestParticipantSummaryAnomalies:
    def test_missing_photo_when_self_scan_has_no_evidence(self) -> None:
        owner = _make_user("svc_summary_owner", role="teacher")
        student = _make_user("svc_summary_student")
        contest = _make_contest(owner)
        participant = ContestParticipant.objects.create(
            contest=contest, user=student, exam_status=ExamStatus.NOT_STARTED
        )
        ExamEvent.objects.create(
            contest=contest,
            user=student,
            event_type="attendance_check_in",
            metadata={
                "attendance_mode": "student_self_scan",
                "attendance_purpose": "check_in",
            },
        )

        summary = svc.build_participant_attendance_summary(contest, participant)
        assert "missing_photo" in summary["anomalies"]

    def test_missing_photo_when_teacher_assisted_lacks_evidence(self) -> None:
        owner = _make_user("svc_summary_assisted_owner", role="teacher")
        student = _make_user("svc_summary_assisted_student")
        contest = _make_contest(owner)
        participant = ContestParticipant.objects.create(
            contest=contest, user=student, exam_status=ExamStatus.NOT_STARTED
        )
        ExamEvent.objects.create(
            contest=contest,
            user=student,
            event_type="attendance_check_in",
            metadata={
                "attendance_mode": "teacher_assisted",
                "attendance_purpose": "check_in",
            },
        )

        summary = svc.build_participant_attendance_summary(contest, participant)
        assert "missing_photo" in summary["anomalies"]

    def test_missing_check_in_anomaly_when_no_event(self) -> None:
        owner = _make_user("svc_summary_missing_owner", role="teacher")
        student = _make_user("svc_summary_missing_student")
        contest = _make_contest(owner)
        participant = ContestParticipant.objects.create(
            contest=contest, user=student, exam_status=ExamStatus.NOT_STARTED
        )

        summary = svc.build_participant_attendance_summary(contest, participant)
        assert "missing_check_in" in summary["anomalies"]
