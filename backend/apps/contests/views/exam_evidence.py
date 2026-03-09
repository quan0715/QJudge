"""ExamEvidenceMixin — video evidence management."""
import logging
import re

from botocore.exceptions import BotoCoreError, ClientError
from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from ..models import (
    Contest,
    ContestParticipant,
    ExamEvidenceJob,
    ExamEvidenceVideo,
)
from ..serializers import (
    ExamEvidenceVideoSerializer,
    ExamEvidenceVideoFlagSerializer,
)
from ..permissions import can_manage_contest
from ..services.anticheat_storage import generate_get_url, get_s3_client
from ..services.exam_submission import (
    enqueue_compile_video,
    ensure_evidence_job,
)

logger = logging.getLogger(__name__)


def _parse_int_param(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


class ExamEvidenceMixin:
    """Mixin for video evidence listing, playback, flagging, and compilation."""

    @staticmethod
    def _list_raw_evidence_keys(client, bucket: str, prefix: str) -> list[str]:
        paginator = client.get_paginator("list_objects_v2")
        keys: list[str] = []
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for item in page.get("Contents", []):
                key = item.get("Key")
                if key:
                    keys.append(key)
        return keys

    @staticmethod
    def _delete_s3_keys(client, bucket: str, keys: list[str]) -> None:
        if not keys:
            return
        chunk_size = 500
        for i in range(0, len(keys), chunk_size):
            chunk = keys[i:i + chunk_size]
            if not chunk:
                continue
            client.delete_objects(
                Bucket=bucket,
                Delete={
                    "Objects": [{"Key": key} for key in chunk],
                    "Quiet": True,
                },
            )

    @classmethod
    def _safe_list_raw_evidence_keys(cls, client, bucket: str, prefix: str) -> list[str]:
        try:
            return cls._list_raw_evidence_keys(client, bucket, prefix)
        except (BotoCoreError, ClientError) as exc:
            logger.warning(
                "Failed to list raw evidence objects for deletion",
                extra={"bucket": bucket, "prefix": prefix, "error": str(exc)},
            )
            return []

    @staticmethod
    def _safe_delete_s3_object(client, bucket: str, key: str) -> None:
        try:
            client.delete_object(Bucket=bucket, Key=key)
        except (BotoCoreError, ClientError) as exc:
            logger.warning(
                "Failed to delete S3 evidence object",
                extra={"bucket": bucket, "key": key, "error": str(exc)},
            )

    @action(detail=False, methods=["get"], url_path="videos")
    def videos(self, request, contest_pk=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        if not can_manage_contest(request.user, contest):
            return Response(
                {'detail': 'You do not have permission to perform this action.'},
                status=status.HTTP_403_FORBIDDEN
            )
        qs = ExamEvidenceVideo.objects.filter(contest=contest).select_related(
            "participant__user", "suspected_by"
        )
        user_id = request.query_params.get("user_id")
        if user_id:
            qs = qs.filter(participant__user_id=user_id)
        flagged_only = request.query_params.get("flagged") == "true"
        if flagged_only:
            qs = qs.filter(is_suspected=True)

        jobs_qs = ExamEvidenceJob.objects.filter(contest=contest).select_related("participant__user")
        if user_id:
            jobs_qs = jobs_qs.filter(participant__user_id=user_id)

        jobs_by_key: dict[tuple[int, str], ExamEvidenceJob] = {}
        for job in jobs_qs.order_by("-created_at"):
            key = (job.participant.user_id, job.upload_session_id or "default")
            jobs_by_key.setdefault(key, job)

        rows: list[dict] = []
        existing_keys: set[tuple[int, str]] = set()
        serialized_videos = ExamEvidenceVideoSerializer(qs, many=True).data
        for row in serialized_videos:
            participant_user_id = int(row.get("participant_user_id"))
            upload_session_id = str(row.get("upload_session_id") or "default")
            key = (participant_user_id, upload_session_id)
            existing_keys.add(key)
            matched_job = jobs_by_key.get(key)

            merged = dict(row)
            merged["has_video"] = True
            merged["job_status"] = matched_job.status if matched_job else "success"
            merged["job_error_message"] = matched_job.error_message if matched_job else ""
            merged["job_raw_count"] = matched_job.raw_count if matched_job else int(row.get("frame_count") or 0)
            merged["job_updated_at"] = (
                matched_job.updated_at.isoformat() if matched_job else row.get("updated_at")
            )
            merged["last_activity_at"] = (
                matched_job.updated_at.isoformat()
                if matched_job
                else str(row.get("updated_at") or row.get("created_at") or "")
            )
            rows.append(merged)

        if not flagged_only:
            for job in jobs_qs.order_by("-created_at"):
                key = (job.participant.user_id, job.upload_session_id or "default")
                if key in existing_keys:
                    continue
                rows.append(
                    {
                        "id": -int(job.id),
                        "job_id": job.id,
                        "participant_user_id": job.participant.user_id,
                        "participant_username": job.participant.user.username,
                        "upload_session_id": job.upload_session_id or "default",
                        "bucket": "",
                        "object_key": "",
                        "duration_seconds": 0,
                        "frame_count": 0,
                        "size_bytes": 0,
                        "is_suspected": False,
                        "suspected_note": "",
                        "suspected_by": None,
                        "suspected_by_username": None,
                        "suspected_at": None,
                        "created_at": job.created_at.isoformat(),
                        "updated_at": job.updated_at.isoformat(),
                        "has_video": False,
                        "job_status": job.status,
                        "job_error_message": job.error_message,
                        "job_raw_count": job.raw_count,
                        "job_updated_at": job.updated_at.isoformat(),
                        "last_activity_at": job.updated_at.isoformat(),
                    }
                )

        rows.sort(
            key=lambda item: str(
                item.get("last_activity_at")
                or item.get("updated_at")
                or item.get("created_at")
                or ""
            ),
            reverse=True,
        )
        return Response(rows)

    @action(detail=False, methods=["get"], url_path=r"videos/(?P<video_id>[^/.]+)/play-url")
    def video_play_url(self, request, contest_pk=None, video_id=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        if not can_manage_contest(request.user, contest):
            return Response(
                {'detail': 'You do not have permission to perform this action.'},
                status=status.HTTP_403_FORBIDDEN
            )
        video = get_object_or_404(ExamEvidenceVideo, id=video_id, contest=contest)
        url = generate_get_url(video.bucket, video.object_key, expires_seconds=120)
        return Response({"url": url, "expires_in": 120})

    @action(detail=False, methods=["get"], url_path=r"videos/(?P<video_id>[^/.]+)/download-url")
    def video_download_url(self, request, contest_pk=None, video_id=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        if not can_manage_contest(request.user, contest):
            return Response(
                {'detail': 'You do not have permission to perform this action.'},
                status=status.HTTP_403_FORBIDDEN
            )
        video = get_object_or_404(ExamEvidenceVideo, id=video_id, contest=contest)
        url = generate_get_url(video.bucket, video.object_key, expires_seconds=120)
        return Response({"url": url, "expires_in": 120})

    @action(detail=False, methods=["patch"], url_path=r"videos/(?P<video_id>[^/.]+)/flag")
    def video_flag(self, request, contest_pk=None, video_id=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        if not can_manage_contest(request.user, contest):
            return Response(
                {'detail': 'You do not have permission to perform this action.'},
                status=status.HTTP_403_FORBIDDEN
            )
        video = get_object_or_404(ExamEvidenceVideo, id=video_id, contest=contest)
        serializer = ExamEvidenceVideoFlagSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        is_suspected = serializer.validated_data["is_suspected"]
        note = serializer.validated_data.get("note", "")
        video.is_suspected = is_suspected
        video.suspected_note = note
        if is_suspected:
            video.suspected_by = request.user
            video.suspected_at = timezone.now()
        else:
            video.suspected_by = None
            video.suspected_at = None
        video.save(update_fields=["is_suspected", "suspected_note", "suspected_by", "suspected_at", "updated_at"])
        return Response(ExamEvidenceVideoSerializer(video).data)

    @action(detail=False, methods=["post"], url_path=r"videos/delete")
    def video_delete(self, request, contest_pk=None):
        """Delete compiled/pending evidence rows and underlying objects. Owner only."""
        contest = get_object_or_404(Contest, id=contest_pk)
        if not request.user.is_authenticated or contest.owner_id != request.user.id:
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        targets = request.data.get("targets", [])
        if not isinstance(targets, list) or not targets:
            return Response({"error": "targets required"}, status=status.HTTP_400_BAD_REQUEST)

        client = get_s3_client()
        deleted: list[dict[str, str | int]] = []
        blocked: list[dict[str, str | int]] = []

        for target in targets:
            if not isinstance(target, dict):
                continue
            try:
                user_id = int(target.get("user_id"))
            except (TypeError, ValueError):
                continue
            upload_session_id = str(target.get("upload_session_id") or "").strip() or "default"
            participant = ContestParticipant.objects.filter(
                contest=contest,
                user_id=user_id,
            ).select_related("user").first()
            if not participant:
                continue

            running_exists = ExamEvidenceJob.objects.filter(
                contest=contest,
                participant=participant,
                upload_session_id=upload_session_id,
                status="running",
            ).exists()
            if running_exists:
                blocked.append(
                    {
                        "user_id": participant.user_id,
                        "upload_session_id": upload_session_id,
                        "reason": "running",
                    }
                )
                continue

            videos_qs = ExamEvidenceVideo.objects.filter(
                contest=contest,
                participant=participant,
                upload_session_id=upload_session_id,
            )
            jobs_qs = ExamEvidenceJob.objects.filter(
                contest=contest,
                participant=participant,
                upload_session_id=upload_session_id,
            )

            if upload_session_id != "default":
                raw_prefix = f"contest_{contest.id}/user_{participant.user_id}/session_{upload_session_id}/"
            else:
                raw_prefix = f"contest_{contest.id}/user_{participant.user_id}/"
            raw_keys = self._safe_list_raw_evidence_keys(
                client,
                settings.ANTICHEAT_RAW_BUCKET,
                raw_prefix,
            )
            self._delete_s3_keys(client, settings.ANTICHEAT_RAW_BUCKET, raw_keys)

            for video in videos_qs:
                if video.bucket and video.object_key:
                    self._safe_delete_s3_object(client, video.bucket, video.object_key)
            videos_qs.delete()
            jobs_qs.delete()

            deleted.append(
                {
                    "user_id": participant.user_id,
                    "upload_session_id": upload_session_id,
                }
            )

        return Response({"deleted": deleted, "blocked": blocked})

    @action(detail=False, methods=["get"], url_path="screenshots")
    def screenshots(self, request, contest_pk=None):
        """Return presigned GET URLs for raw screenshot frames matching filters.

        Query params:
          - user_id (required): participant user id
          - ts_from: lower bound timestamp in ms (inclusive)
          - ts_to: upper bound timestamp in ms (inclusive)
          - upload_session_id: specific session (default: all sessions)
          - limit: max frames to return (default 20, max 50)
        """
        contest = get_object_or_404(Contest, id=contest_pk)
        if not can_manage_contest(request.user, contest):
            return Response(
                {'detail': 'You do not have permission to perform this action.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        user_id = request.query_params.get("user_id")
        if not user_id:
            return Response({"error": "user_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user_id = int(user_id)
        except (TypeError, ValueError):
            return Response({"error": "invalid user_id"}, status=status.HTTP_400_BAD_REQUEST)

        participant = ContestParticipant.objects.filter(contest=contest, user_id=user_id).first()
        if not participant:
            return Response({"error": "participant not found"}, status=status.HTTP_404_NOT_FOUND)

        upload_session_id = (request.query_params.get("upload_session_id") or "").strip()
        ts_from = _parse_int_param(request.query_params.get("ts_from"))
        ts_to = _parse_int_param(request.query_params.get("ts_to"))
        limit = min(_parse_int_param(request.query_params.get("limit")) or 20, 50)

        # Build S3 prefix
        if upload_session_id:
            prefix = f"contest_{contest.id}/user_{user_id}/session_{upload_session_id}/"
        else:
            prefix = f"contest_{contest.id}/user_{user_id}/"

        try:
            client = get_s3_client()
            raw_keys = self._safe_list_raw_evidence_keys(client, settings.ANTICHEAT_RAW_BUCKET, prefix)
        except (BotoCoreError, ClientError) as exc:
            logger.warning("screenshots: failed to list S3 keys", extra={"error": str(exc)})
            return Response({"error": "storage unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        ts_re = re.compile(r"/ts_(\d+)_seq_(\d+)\.webp$")
        frames = []
        for key in raw_keys:
            m = ts_re.search(key)
            if not m:
                continue
            ts_ms = int(m.group(1))
            seq = int(m.group(2))
            if ts_from is not None and ts_ms < ts_from:
                continue
            if ts_to is not None and ts_ms > ts_to:
                continue
            frames.append({"key": key, "ts_ms": ts_ms, "seq": seq})

        # Sort newest first, then apply limit
        frames.sort(key=lambda f: f["ts_ms"], reverse=True)
        frames = frames[:limit]

        # Generate presigned GET URLs
        items = []
        for frame in frames:
            url = generate_get_url(settings.ANTICHEAT_RAW_BUCKET, frame["key"], expires_seconds=120)
            items.append({
                "url": url,
                "ts_ms": frame["ts_ms"],
                "seq": frame["seq"],
                "expires_in": 120,
            })

        return Response({"items": items, "total_raw_count": len(raw_keys)})

    @action(detail=False, methods=["post"], url_path=r"videos/compile")
    def video_compile(self, request, contest_pk=None):
        """Trigger on-demand video compilation for specific participants."""
        contest = get_object_or_404(Contest, id=contest_pk)
        if not can_manage_contest(request.user, contest):
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        targets = request.data.get("targets", [])
        if not isinstance(targets, list) or not targets:
            return Response({"error": "targets required"}, status=status.HTTP_400_BAD_REQUEST)

        queued = []
        for target in targets:
            if not isinstance(target, dict):
                continue
            try:
                user_id = int(target.get("user_id"))
            except (TypeError, ValueError):
                continue
            upload_session_id = str(target.get("upload_session_id") or "").strip() or "default"
            participant = ContestParticipant.objects.filter(
                contest=contest,
                user_id=user_id,
            ).first()
            if not participant:
                continue
            ensure_evidence_job(participant, upload_session_id)
            enqueue_compile_video(participant.id, upload_session_id)
            queued.append({
                "user_id": participant.user_id,
                "upload_session_id": upload_session_id,
            })
        return Response({"queued": queued})
