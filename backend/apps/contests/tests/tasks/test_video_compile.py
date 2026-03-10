"""
Tests for the compile_anticheat_video task.

These tests mock S3/FFmpeg to verify the task logic without external deps.
For full integration (real MinIO + FFmpeg), use the smoke script:
    scripts/smoke-anticheat-e2e.sh
"""
from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.contests.models import (
    Contest,
    ContestParticipant,
    ExamEvidenceJob,
    ExamEvidenceVideo,
    ExamStatus,
    EvidenceJobStatus,
)

User = get_user_model()


def _make_contest_and_participant(owner, student, **contest_kwargs):
    defaults = dict(
        name="Video Test",
        owner=owner,
        start_time=timezone.now() - timedelta(hours=1),
        end_time=timezone.now() + timedelta(hours=1),
        status="published",
        cheat_detection_enabled=True,
        contest_type="paper_exam",
    )
    defaults.update(contest_kwargs)
    contest = Contest.objects.create(**defaults)
    participant = ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.SUBMITTED,
        started_at=timezone.now() - timedelta(minutes=30),
        left_at=timezone.now(),
    )
    return contest, participant


def _mock_s3_with_keys(mock_client, keys):
    """Configure mock S3 client's paginator to return the given keys."""
    paginator = MagicMock()
    pages = [{"Contents": [{"Key": k} for k in keys]}] if keys else [{}]
    paginator.paginate.return_value = pages
    mock_client.get_paginator.return_value = paginator


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    ANTICHEAT_RAW_BUCKET="anticheat-raw",
    ANTICHEAT_VIDEO_BUCKET="anticheat-videos",
)
class CompileAnticheatVideoTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="vid_owner", email="vid_owner@test.com", password="pw", role="teacher"
        )
        self.student = User.objects.create_user(
            username="vid_student", email="vid_student@test.com", password="pw"
        )

    # ------------------------------------------------------------------
    # Happy path
    # ------------------------------------------------------------------
    @patch("apps.contests.tasks.shutil.rmtree")
    @patch("apps.contests.tasks.subprocess.run")
    @patch("apps.contests.tasks.get_s3_client")
    @patch("apps.contests.tasks.tempfile.mkdtemp", return_value="/tmp/anticheat_fake")
    @patch("apps.contests.tasks.os.path.getsize", return_value=12345)
    def test_compile_success_creates_video_and_job(
        self, mock_getsize, mock_mkdtemp, mock_s3_factory, mock_subprocess, mock_rmtree
    ):
        from apps.contests.tasks import compile_anticheat_video

        contest, participant = _make_contest_and_participant(self.owner, self.student)
        session_id = "test-session-abc"

        mock_client = MagicMock()
        mock_s3_factory.return_value = mock_client
        _mock_s3_with_keys(mock_client, [
            f"contest_{contest.id}/user_{self.student.id}/session_{session_id}/ts_100_seq_0001.webp",
            f"contest_{contest.id}/user_{self.student.id}/session_{session_id}/ts_200_seq_0002.webp",
            f"contest_{contest.id}/user_{self.student.id}/session_{session_id}/ts_300_seq_0003.webp",
        ])

        result = compile_anticheat_video(participant.id, session_id)

        self.assertIn("3 frames", result)

        # FFmpeg was called
        mock_subprocess.assert_called_once()
        cmd = mock_subprocess.call_args[0][0]
        self.assertEqual(cmd[0], "ffmpeg")

        # S3 upload was called
        mock_client.upload_file.assert_called_once()
        upload_args = mock_client.upload_file.call_args
        self.assertIn("video/mp4", str(upload_args))

        # Evidence job SUCCESS
        job = ExamEvidenceJob.objects.get(
            contest=contest, participant=participant, upload_session_id=session_id
        )
        self.assertEqual(job.status, EvidenceJobStatus.SUCCESS)
        self.assertEqual(job.raw_count, 3)
        self.assertIsNotNone(job.finished_at)

        # Evidence video created
        video = ExamEvidenceVideo.objects.get(
            contest=contest, participant=participant, upload_session_id=session_id
        )
        self.assertEqual(video.frame_count, 3)
        self.assertEqual(video.size_bytes, 12345)

        # Raw screenshots preserved (not deleted) for later access
        mock_client.delete_objects.assert_not_called()

        # Temp dir cleaned up
        mock_rmtree.assert_called_once_with("/tmp/anticheat_fake", ignore_errors=True)

    # ------------------------------------------------------------------
    # No raw screenshots → FAILED
    # ------------------------------------------------------------------
    @patch("apps.contests.tasks.shutil.rmtree")
    @patch("apps.contests.tasks.get_s3_client")
    @patch("apps.contests.tasks.tempfile.mkdtemp", return_value="/tmp/anticheat_fake")
    def test_no_raw_frames_marks_job_failed(
        self, mock_mkdtemp, mock_s3_factory, mock_rmtree
    ):
        from apps.contests.tasks import compile_anticheat_video

        contest, participant = _make_contest_and_participant(self.owner, self.student)

        mock_client = MagicMock()
        mock_s3_factory.return_value = mock_client
        _mock_s3_with_keys(mock_client, [])

        result = compile_anticheat_video(participant.id, "empty-session")

        self.assertIn("No raw screenshots", result)

        job = ExamEvidenceJob.objects.get(
            contest=contest, participant=participant, upload_session_id="empty-session"
        )
        self.assertEqual(job.status, EvidenceJobStatus.FAILED)
        self.assertIn("No raw screenshots", job.error_message)

    # ------------------------------------------------------------------
    # FFmpeg failure → FAILED, raw keys tagged retain
    # ------------------------------------------------------------------
    @patch("apps.contests.tasks.shutil.rmtree")
    @patch("apps.contests.tasks.tag_object_retain")
    @patch("apps.contests.tasks.subprocess.run", side_effect=Exception("ffmpeg crashed"))
    @patch("apps.contests.tasks.get_s3_client")
    @patch("apps.contests.tasks.tempfile.mkdtemp", return_value="/tmp/anticheat_fake")
    def test_ffmpeg_failure_marks_job_failed_and_retains_raw(
        self, mock_mkdtemp, mock_s3_factory, mock_subprocess, mock_tag, mock_rmtree
    ):
        from apps.contests.tasks import compile_anticheat_video

        contest, participant = _make_contest_and_participant(self.owner, self.student)
        session_id = "fail-session"

        mock_client = MagicMock()
        mock_s3_factory.return_value = mock_client
        _mock_s3_with_keys(mock_client, [
            f"contest_{contest.id}/user_{self.student.id}/session_{session_id}/ts_100_seq_0001.webp",
        ])

        result = compile_anticheat_video(participant.id, session_id)

        self.assertIn("Failed", result)

        job = ExamEvidenceJob.objects.get(
            contest=contest, participant=participant, upload_session_id=session_id
        )
        self.assertEqual(job.status, EvidenceJobStatus.FAILED)
        self.assertIn("ffmpeg crashed", job.error_message)

        # Raw files tagged retain
        mock_tag.assert_called_once()

        # Temp dir still cleaned
        mock_rmtree.assert_called_once()

    # ------------------------------------------------------------------
    # Participant not found → graceful return
    # ------------------------------------------------------------------
    def test_participant_not_found(self):
        from apps.contests.tasks import compile_anticheat_video

        result = compile_anticheat_video(999999, "whatever")
        self.assertIn("not found", result)

    # ------------------------------------------------------------------
    # Job already RUNNING → skip
    # ------------------------------------------------------------------
    @patch("apps.contests.tasks.get_s3_client")
    @patch("apps.contests.tasks.tempfile.mkdtemp", return_value="/tmp/anticheat_fake")
    def test_skip_if_job_already_running(self, mock_mkdtemp, mock_s3_factory):
        from apps.contests.tasks import compile_anticheat_video

        contest, participant = _make_contest_and_participant(self.owner, self.student)
        ExamEvidenceJob.objects.create(
            contest=contest,
            participant=participant,
            upload_session_id="running-session",
            status=EvidenceJobStatus.RUNNING,
        )

        result = compile_anticheat_video(participant.id, "running-session")
        self.assertIn("already running", result)

    # ------------------------------------------------------------------
    # Previous SUCCESS + no new frames → keep previous
    # ------------------------------------------------------------------
    @patch("apps.contests.tasks.shutil.rmtree")
    @patch("apps.contests.tasks.get_s3_client")
    @patch("apps.contests.tasks.tempfile.mkdtemp", return_value="/tmp/anticheat_fake")
    def test_no_new_frames_keeps_previous_success(
        self, mock_mkdtemp, mock_s3_factory, mock_rmtree
    ):
        from apps.contests.tasks import compile_anticheat_video

        contest, participant = _make_contest_and_participant(self.owner, self.student)
        ExamEvidenceJob.objects.create(
            contest=contest,
            participant=participant,
            upload_session_id="done-session",
            status=EvidenceJobStatus.SUCCESS,
        )

        mock_client = MagicMock()
        mock_s3_factory.return_value = mock_client
        _mock_s3_with_keys(mock_client, [])

        result = compile_anticheat_video(participant.id, "done-session")
        self.assertIn("keeping previous SUCCESS", result)

        # Job status unchanged
        job = ExamEvidenceJob.objects.get(
            contest=contest, participant=participant, upload_session_id="done-session"
        )
        self.assertEqual(job.status, EvidenceJobStatus.SUCCESS)

    # ------------------------------------------------------------------
    # default session must not mix frames from other session_* folders
    # ------------------------------------------------------------------
    @patch("apps.contests.tasks.shutil.rmtree")
    @patch("apps.contests.tasks.subprocess.run")
    @patch("apps.contests.tasks.get_s3_client")
    @patch("apps.contests.tasks.tempfile.mkdtemp", return_value="/tmp/anticheat_fake")
    @patch("apps.contests.tasks.os.path.getsize", return_value=4321)
    def test_default_session_uses_scoped_prefix_only(
        self, mock_getsize, mock_mkdtemp, mock_s3_factory, mock_subprocess, mock_rmtree
    ):
        from apps.contests.tasks import compile_anticheat_video

        contest, participant = _make_contest_and_participant(self.owner, self.student)

        default_keys = [
            f"contest_{contest.id}/user_{self.student.id}/session_default/ts_100_seq_0001.webp",
            f"contest_{contest.id}/user_{self.student.id}/session_default/ts_200_seq_0002.webp",
        ]
        other_session_keys = [
            f"contest_{contest.id}/user_{self.student.id}/session_other/ts_300_seq_0001.webp",
        ]

        mock_client = MagicMock()
        mock_s3_factory.return_value = mock_client
        paginator = MagicMock()
        mock_client.get_paginator.return_value = paginator

        def _paginate_side_effect(*, Bucket, Prefix):
            if Prefix.endswith("/session_default/"):
                return [{"Contents": [{"Key": k} for k in default_keys]}]
            if Prefix.endswith(f"/user_{self.student.id}/"):
                return [{"Contents": [{"Key": k} for k in other_session_keys]}]
            return [{}]

        paginator.paginate.side_effect = _paginate_side_effect

        result = compile_anticheat_video(participant.id, "default")
        self.assertIn("2 frames", result)

        # Ensure only session_default frames are counted.
        job = ExamEvidenceJob.objects.get(
            contest=contest, participant=participant, upload_session_id="default"
        )
        self.assertEqual(job.raw_count, 2)

    # ------------------------------------------------------------------
    # key ordering should follow timestamp first to avoid fragmented timeline
    # ------------------------------------------------------------------
    @patch("apps.contests.tasks.get_s3_client")
    def test_raw_keys_sorted_by_timestamp_then_seq(self, mock_s3_factory):
        from apps.contests.tasks import _list_raw_keys

        mock_client = MagicMock()
        mock_s3_factory.return_value = mock_client
        paginator = MagicMock()
        mock_client.get_paginator.return_value = paginator
        paginator.paginate.return_value = [{
            "Contents": [
                {"Key": "contest_1/user_1/session_a/ts_300_seq_0001.webp"},
                {"Key": "contest_1/user_1/session_a/ts_100_seq_0003.webp"},
                {"Key": "contest_1/user_1/session_a/ts_100_seq_0001.webp"},
                {"Key": "contest_1/user_1/session_a/ts_200_seq_0002.webp"},
            ]
        }]

        keys = _list_raw_keys(mock_client, "bucket", "contest_1/user_1/session_a/")

        self.assertEqual(
            keys,
            [
                "contest_1/user_1/session_a/ts_100_seq_0001.webp",
                "contest_1/user_1/session_a/ts_100_seq_0003.webp",
                "contest_1/user_1/session_a/ts_200_seq_0002.webp",
                "contest_1/user_1/session_a/ts_300_seq_0001.webp",
            ],
        )
