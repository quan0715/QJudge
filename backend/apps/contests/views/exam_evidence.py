"""ExamEvidenceMixin — manifest-backed screenshot evidence APIs."""
from __future__ import annotations

from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from botocore.exceptions import BotoCoreError, ClientError
from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response

from ..models import Contest, ContestParticipant, ExamEvent, ExamEvidenceFrame, ExamStatus
from ..permissions import can_manage_contest
from ..serializers import EvidenceUploadConfirmSerializer, EvidenceUploadIntentSerializer
from ..services.anticheat_storage import (
    build_raw_object_key,
    build_upload_session_id,
    generate_get_url,
    generate_put_url,
    get_s3_client,
)
from ..services.exam_submission import normalize_source_module
from ..services.exam_validation import validate_exam_operation

FRAME_WINDOW_TOLERANCE_MS = 1_000
PRE_LOSS_WINDOW_MS = 6_000
ANCHOR_WINDOW_MS = 3_000
EVIDENCE_CONTENT_TYPE = "image/webp"
DEFAULT_MAX_EVIDENCE_FRAME_BYTES = 2 * 1024 * 1024


def _parse_int_param(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_event_time_ms(value) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value) if value >= 0 else None
    if not isinstance(value, str) or not value:
        return None
    dt = parse_datetime(value)
    if dt is not None:
        if dt.tzinfo is None:
            dt = timezone.make_aware(dt)
        return int(dt.timestamp() * 1000)
    try:
        parsed = int(float(value))
    except ValueError:
        return None
    return parsed if parsed >= 0 else None


def _event_window_ms(event: ExamEvent | None, ts_from: int | None, ts_to: int | None):
    if ts_from is not None or ts_to is not None:
        return ts_from, ts_to
    if event is None:
        return ts_from, ts_to

    metadata = event.metadata if isinstance(event.metadata, dict) else {}
    from_metadata_from = _parse_event_time_ms(metadata.get("evidence_window_start"))
    from_metadata_to = _parse_event_time_ms(metadata.get("evidence_window_end"))
    if from_metadata_from is not None and from_metadata_to is not None:
        return from_metadata_from, from_metadata_to

    anchor_ms = _parse_event_time_ms(metadata.get("evidence_anchor_at_ms"))
    if anchor_ms is None:
        anchor_ms = int((event.created_at or timezone.now()).timestamp() * 1000)
    if metadata.get("evidence_mode") == ExamEvidenceFrame.EvidenceMode.PRE_LOSS:
        return anchor_ms - PRE_LOSS_WINDOW_MS, anchor_ms
    return anchor_ms - ANCHOR_WINDOW_MS, anchor_ms + ANCHOR_WINDOW_MS


def _event_for_lookup(contest: Contest, user_id: int | None, event_id: int | None = None, cluster_id: str = ""):
    if event_id is not None:
        event = get_object_or_404(
            ExamEvent.objects.select_related("user"),
            contest=contest,
            id=event_id,
        )
        if user_id is not None and event.user_id != user_id:
            return None, Response(
                {"error": "event_id does not match user_id"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return event, None

    if cluster_id and user_id is not None:
        event = (
            ExamEvent.objects.filter(
                contest=contest,
                user_id=user_id,
                metadata__evidence_cluster_id=cluster_id,
            )
            .order_by("-created_at")
            .first()
        )
        if event is None:
            return None, Response(
                {"error": "event with given evidence_cluster_id not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        return event, None

    if cluster_id:
        return None, Response(
            {"error": "user_id is required when evidence_cluster_id is used"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return None, None


def _event_expected_loss_module(event: ExamEvent) -> str | None:
    if event.event_type == "screen_share_stopped":
        return "screen_share"
    if event.event_type == "webcam_stopped":
        return "webcam"
    return None


def _validate_frame_time(event: ExamEvent, evidence_mode: str, captured_at_ms: int) -> str | None:
    metadata = event.metadata if isinstance(event.metadata, dict) else {}
    window_start, window_end = _event_window_ms(event, None, None)
    if window_start is None or window_end is None:
        return None

    if evidence_mode == ExamEvidenceFrame.EvidenceMode.PRE_LOSS:
        loss_detected_at_ms = (
            _parse_event_time_ms(metadata.get("loss_detected_at_ms"))
            or _parse_event_time_ms(metadata.get("evidence_anchor_at_ms"))
            or window_end
        )
        if captured_at_ms > loss_detected_at_ms + FRAME_WINDOW_TOLERANCE_MS:
            return "pre_loss evidence cannot include post-loss frames"
        if captured_at_ms < window_start - FRAME_WINDOW_TOLERANCE_MS:
            return "frame is outside the pre-loss evidence window"
        return None

    if captured_at_ms < window_start - FRAME_WINDOW_TOLERANCE_MS:
        return "frame is before the evidence window"
    if captured_at_ms > window_end + FRAME_WINDOW_TOLERANCE_MS:
        return "frame is after the evidence window"
    return None


def _storage_error_code(exc: ClientError) -> str:
    error = getattr(exc, "response", {}).get("Error", {})
    return str(error.get("Code") or "")


def _validate_evidence_object_head(client, object_key: str):
    try:
        head = client.head_object(Bucket=settings.ANTICHEAT_RAW_BUCKET, Key=object_key)
    except ClientError as exc:
        code = _storage_error_code(exc)
        if code in {"404", "NoSuchKey", "NotFound", "NoSuchBucket"}:
            return None, Response(
                {"error": "evidence object was not found in storage"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return None, Response(
            {"error": "evidence storage validation failed"},
            status=status.HTTP_502_BAD_GATEWAY,
        )
    except BotoCoreError:
        return None, Response(
            {"error": "evidence storage validation failed"},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    content_type = str(head.get("ContentType") or "").split(";", 1)[0].strip().lower()
    if content_type != EVIDENCE_CONTENT_TYPE:
        return None, Response(
            {"error": "evidence object must be image/webp"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        byte_size = int(head.get("ContentLength"))
    except (TypeError, ValueError):
        byte_size = -1
    max_bytes = int(
        getattr(settings, "ANTICHEAT_EVIDENCE_MAX_FRAME_BYTES", DEFAULT_MAX_EVIDENCE_FRAME_BYTES)
    )
    if byte_size <= 0:
        return None, Response(
            {"error": "evidence object is empty"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if byte_size > max_bytes:
        return None, Response(
            {"error": "evidence object is too large"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return {
        "byte_size": byte_size,
        "content_type": content_type,
        "etag": str(head.get("ETag") or "").strip('"'),
        "last_modified": head.get("LastModified"),
    }, None


class ExamEvidenceMixin:
    """Mixin for manifest-backed evidence lookup and upload intent APIs."""

    def _validate_evidence_participant(self, request, contest: Contest):
        participant, error_response = validate_exam_operation(
            contest,
            request.user,
            require_in_progress=False,
            allow_admin_bypass=False,
        )
        if error_response:
            return None, error_response
        if participant is None:
            return None, Response({"error": "Not registered"}, status=status.HTTP_400_BAD_REQUEST)
        allowed_statuses = set(self.MONITORED_STATUSES) | {ExamStatus.SUBMITTED}
        if participant.exam_status not in allowed_statuses:
            return None, Response(
                {"error": f"Evidence upload is not accepted in current state: {participant.exam_status}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if participant.exam_status in self.MONITORED_STATUSES:
            conflict_response = self._ensure_active_device_session(contest, participant, request)
            if conflict_response:
                return None, conflict_response
        return participant, None

    @action(
        detail=False,
        methods=["post"],
        url_path="evidence/upload-intents",
        permission_classes=[permissions.IsAuthenticated],
    )
    def evidence_upload_intents(self, request, contest_pk=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        participant, error_response = self._validate_evidence_participant(request, contest)
        if error_response is not None:
            return error_response

        serializer = EvidenceUploadIntentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        event = get_object_or_404(
            ExamEvent,
            contest=contest,
            user=request.user,
            id=data["event_id"],
        )

        metadata = event.metadata if isinstance(event.metadata, dict) else {}
        evidence_cluster_id = str(data.get("evidence_cluster_id") or metadata.get("evidence_cluster_id") or "")
        if data.get("evidence_cluster_id") and metadata.get("evidence_cluster_id"):
            if str(data["evidence_cluster_id"]) != str(metadata["evidence_cluster_id"]):
                return Response(
                    {"error": "evidence_cluster_id does not match event"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        evidence_mode = str(data.get("evidence_mode") or metadata.get("evidence_mode") or "anchor_window")
        source_module = normalize_source_module(data.get("source_module"))
        expected_loss_module = _event_expected_loss_module(event)
        if evidence_mode == ExamEvidenceFrame.EvidenceMode.PRE_LOSS and expected_loss_module:
            if source_module != expected_loss_module:
                return Response(
                    {"error": "pre_loss evidence must target the lost source module"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        upload_session_id = str(data.get("upload_session_id") or "").strip() or build_upload_session_id()
        frames = list(data.get("frames") or [])
        unavailable_reason = str(data.get("unavailable_reason") or "").strip()

        if not frames:
            unavailable = ExamEvidenceFrame.objects.create(
                contest=contest,
                user=request.user,
                exam_event=event,
                evidence_cluster_id=evidence_cluster_id,
                source_module=source_module,
                evidence_mode=evidence_mode,
                upload_session_id=upload_session_id,
                status=ExamEvidenceFrame.Status.UNAVAILABLE,
                metadata={
                    "reason": unavailable_reason or "no_frames_available",
                    "event_type": event.event_type,
                },
            )
            return Response(
                {
                    "upload_session_id": upload_session_id,
                    "evidence_cluster_id": evidence_cluster_id,
                    "items": [],
                    "unavailable": True,
                    "unavailable_frame_id": unavailable.id,
                },
                status=status.HTTP_201_CREATED,
            )

        for frame in frames:
            error = _validate_frame_time(event, evidence_mode, int(frame["client_captured_at_ms"]))
            if error:
                return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        presign_client = get_s3_client(
            endpoint_url=(settings.OBJECT_STORAGE_PUBLIC_ENDPOINT_URL or "").strip() or None
        )
        expires_seconds = settings.OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS
        issued_items = []
        with transaction.atomic():
            for frame in frames:
                seq = int(frame["seq"])
                captured_at_ms = int(frame["client_captured_at_ms"])
                object_key = build_raw_object_key(
                    contest_id=contest.id,
                    user_id=request.user.id,
                    upload_session_id=upload_session_id,
                    ts_ms=captured_at_ms,
                    seq=seq,
                    module=source_module,
                )
                manifest = ExamEvidenceFrame.objects.create(
                    contest=contest,
                    user=request.user,
                    exam_event=event,
                    evidence_cluster_id=evidence_cluster_id,
                    source_module=source_module,
                    evidence_mode=evidence_mode,
                    upload_session_id=upload_session_id,
                    seq=seq,
                    object_key=object_key,
                    client_captured_at_ms=captured_at_ms,
                    status=ExamEvidenceFrame.Status.ISSUED,
                    metadata={
                        "event_type": event.event_type,
                        "window_start_ms": _event_window_ms(event, None, None)[0],
                        "window_end_ms": _event_window_ms(event, None, None)[1],
                    },
                )
                put_url = generate_put_url(
                    settings.ANTICHEAT_RAW_BUCKET,
                    object_key,
                    expires_seconds=expires_seconds,
                    client=presign_client,
                )
                issued_items.append(
                    {
                        "evidence_frame_id": manifest.id,
                        "seq": seq,
                        "object_key": object_key,
                        "source_module": source_module,
                        "client_captured_at_ms": captured_at_ms,
                        "put_url": put_url,
                        "required_headers": {
                            "Content-Type": "image/webp",
                            **(
                                {"x-amz-tagging": "cleanup=true"}
                                if settings.OBJECT_STORAGE_OBJECT_TAGGING_ENABLED
                                else {}
                            ),
                        },
                    }
                )

        return Response(
            {
                "upload_session_id": upload_session_id,
                "evidence_cluster_id": evidence_cluster_id,
                "evidence_mode": evidence_mode,
                "expires_at": timezone.now() + timezone.timedelta(seconds=expires_seconds),
                "items": issued_items,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=False,
        methods=["post"],
        url_path="evidence/upload-confirm",
        permission_classes=[permissions.IsAuthenticated],
    )
    def evidence_upload_confirm(self, request, contest_pk=None):
        contest = get_object_or_404(Contest, id=contest_pk)
        participant, error_response = self._validate_evidence_participant(request, contest)
        if error_response is not None:
            return error_response

        serializer = EvidenceUploadConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        event_id = data.get("event_id")
        upload_session_id = str(data.get("upload_session_id") or "").strip()
        frame_payloads = list(data["frames"])
        ids = [item["evidence_frame_id"] for item in frame_payloads]

        rows = {
            row.id: row
            for row in ExamEvidenceFrame.objects.filter(
                contest=contest,
                user=request.user,
                id__in=ids,
                status=ExamEvidenceFrame.Status.ISSUED,
            )
        }
        if len(rows) != len(set(ids)):
            return Response(
                {"error": "confirm can only target issued frames for the same contest/user"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        storage_facts = {}
        storage_client = get_s3_client()
        for payload in frame_payloads:
            row = rows[payload["evidence_frame_id"]]
            if event_id is not None and row.exam_event_id != event_id:
                return Response({"error": "frame does not match event_id"}, status=status.HTTP_400_BAD_REQUEST)
            if upload_session_id and row.upload_session_id != upload_session_id:
                return Response(
                    {"error": "frame does not match upload_session_id"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if row.object_key != payload["object_key"]:
                return Response({"error": "frame object_key mismatch"}, status=status.HTTP_400_BAD_REQUEST)

            facts, storage_error = _validate_evidence_object_head(storage_client, row.object_key)
            if storage_error is not None:
                return storage_error
            storage_facts[row.id] = facts

        confirmed = []
        with transaction.atomic():
            locked_rows = {
                row.id: row
                for row in ExamEvidenceFrame.objects.select_for_update().filter(
                    contest=contest,
                    user=request.user,
                    id__in=ids,
                    status=ExamEvidenceFrame.Status.ISSUED,
                )
            }
            if len(locked_rows) != len(set(ids)):
                return Response(
                    {"error": "confirm can only target issued frames for the same contest/user"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            now = timezone.now()
            for payload in frame_payloads:
                row = locked_rows[payload["evidence_frame_id"]]
                facts = storage_facts[row.id]
                metadata = row.metadata if isinstance(row.metadata, dict) else {}
                metadata["storage_head"] = {
                    "content_type": facts["content_type"],
                    "byte_size": facts["byte_size"],
                    "etag": facts["etag"],
                    "last_modified": (
                        facts["last_modified"].isoformat()
                        if hasattr(facts["last_modified"], "isoformat")
                        else None
                    ),
                }
                if payload.get("sha256"):
                    metadata["client_reported_sha256"] = str(payload.get("sha256") or "").lower()
                row.status = ExamEvidenceFrame.Status.UPLOADED
                row.storage_confirmed_at = now
                row.content_type = facts["content_type"]
                row.byte_size = facts["byte_size"]
                row.sha256 = ""
                row.metadata = metadata
                row.save(update_fields=[
                    "status",
                    "storage_confirmed_at",
                    "content_type",
                    "byte_size",
                    "sha256",
                    "metadata",
                ])
                confirmed.append(
                    {
                        "evidence_frame_id": row.id,
                        "seq": row.seq,
                        "object_key": row.object_key,
                        "client_captured_at_ms": row.client_captured_at_ms,
                    }
                )

        return Response({"confirmed": confirmed, "confirmed_count": len(confirmed)})

    @action(detail=False, methods=["get"], url_path="screenshots")
    def screenshots(self, request, contest_pk=None):
        """Return presigned GET URLs for uploaded manifest frames."""
        contest = get_object_or_404(Contest, id=contest_pk)
        if not can_manage_contest(request.user, contest):
            return Response(
                {"detail": "You do not have permission to perform this action."},
                status=status.HTTP_403_FORBIDDEN,
            )

        user_id = request.query_params.get("user_id")
        event_id = _parse_int_param(request.query_params.get("event_id"))
        evidence_cluster_id = (request.query_params.get("evidence_cluster_id") or "").strip()

        if user_id is not None:
            try:
                user_id = int(user_id)
            except (TypeError, ValueError):
                return Response({"error": "invalid user_id"}, status=status.HTTP_400_BAD_REQUEST)

        anchor_event, lookup_error = _event_for_lookup(
            contest,
            user_id,
            event_id=event_id,
            cluster_id=evidence_cluster_id,
        )
        if lookup_error is not None:
            return lookup_error
        if user_id is None and anchor_event is not None:
            user_id = anchor_event.user_id
        if user_id is None:
            return Response({"error": "user_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        participant = ContestParticipant.objects.filter(contest=contest, user_id=user_id).first()
        if not participant:
            return Response({"error": "participant not found"}, status=status.HTTP_404_NOT_FOUND)

        upload_session_id = (request.query_params.get("upload_session_id") or "").strip()
        source_module_raw = (request.query_params.get("source_module") or "").strip()
        source_module = normalize_source_module(source_module_raw) if source_module_raw else ""

        ts_from = _parse_int_param(request.query_params.get("ts_from"))
        ts_to = _parse_int_param(request.query_params.get("ts_to"))
        ts_from, ts_to = _event_window_ms(anchor_event, ts_from, ts_to)
        limit = min(_parse_int_param(request.query_params.get("limit")) or 20, 50)

        qs = ExamEvidenceFrame.objects.filter(
            contest=contest,
            user_id=user_id,
            status=ExamEvidenceFrame.Status.UPLOADED,
        )
        if anchor_event is not None:
            qs = qs.filter(exam_event=anchor_event)
        elif evidence_cluster_id:
            qs = qs.filter(evidence_cluster_id=evidence_cluster_id)
        if upload_session_id:
            qs = qs.filter(upload_session_id=upload_session_id)
        if source_module:
            qs = qs.filter(source_module=source_module)
        if ts_from is not None:
            qs = qs.filter(client_captured_at_ms__gte=ts_from)
        if ts_to is not None:
            qs = qs.filter(client_captured_at_ms__lte=ts_to)

        total_filtered_count = qs.count()
        frames = list(qs.order_by("-client_captured_at_ms", "-seq")[:limit])
        items = []
        for frame in frames:
            if not frame.object_key:
                continue
            url = generate_get_url(settings.ANTICHEAT_RAW_BUCKET, frame.object_key, expires_seconds=120)
            captured_at = frame.client_captured_at_ms
            items.append(
                {
                    "url": url,
                    "ts_ms": captured_at,
                    "seq": frame.seq,
                    "source_module": frame.source_module,
                    "evidence_frame_id": frame.id,
                    "evidence_mode": frame.evidence_mode,
                    "expires_in": 120,
                }
            )

        return Response(
            {
                "items": items,
                "total_raw_count": total_filtered_count,
                "storage_error": False,
            }
        )
