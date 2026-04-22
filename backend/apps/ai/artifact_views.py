"""Artifact REST endpoints for session-scoped AI outputs.

Two surfaces:

* ``/ai/_internal/artifacts/`` — ai-service only, validated via
  ``X-AI-Internal-Token``. Used by agent tools to write / read / list.
* ``/ai/artifacts/`` — session-authenticated user view. Used by the
  frontend Artifact Panel to list and preview.
"""
from __future__ import annotations

import os
import re

from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import AIArtifact, AIChatRun, AISession
from .permissions import IsAIServiceInternal
from .serializers import AIArtifactSerializer, AIArtifactWriteSerializer
from .services import artifact_storage

_UPLOAD_FILENAME_RE = re.compile(r"^[A-Za-z0-9._\-]{1,255}$")
_UPLOAD_STEP_RE = re.compile(r"^[A-Za-z0-9_\-]{1,64}$")
_USER_UPLOAD_STEP = "user_upload"
_ALLOWED_UPLOAD_EXTS = {".csv", ".md", ".json"}
_ALLOWED_UPLOAD_CONTENT_TYPES = {
    "text/csv",
    "application/csv",
    "application/json",
    "text/plain",
    "text/markdown",
    "text/x-markdown",
}


def _user_session_qs(user):
    return AISession.objects.filter(user=user)


def _encode_content(text: str, content_type: str) -> bytes:
    if "charset=" in (content_type or "").lower():
        # Trust caller-specified charset.
        return text.encode("utf-8")
    return text.encode("utf-8")


class AIArtifactInternalViewSet(viewsets.ViewSet):
    """Internal endpoints for ai-service artifact tools."""

    # Bypass session/JWT auth entirely — the internal token is the credential.
    authentication_classes: list = []
    permission_classes = [IsAIServiceInternal]

    def list(self, request):
        session_id = request.query_params.get("session_id")
        if not session_id:
            return Response(
                {"detail": "session_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        qs = AIArtifact.objects.filter(session_id=session_id)
        step = request.query_params.get("step")
        if step:
            qs = qs.filter(step=step)
        filename = request.query_params.get("filename")
        if filename:
            qs = qs.filter(filename=filename)
        serializer = AIArtifactSerializer(qs, many=True)
        return Response(serializer.data)

    def create(self, request):
        serializer = AIArtifactWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        content_bytes = _encode_content(data["content"], data["content_type"])
        max_bytes = settings.AI_ARTIFACT_MAX_BYTES
        if len(content_bytes) > max_bytes:
            return Response(
                {"detail": f"content exceeds AI_ARTIFACT_MAX_BYTES={max_bytes}"},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )

        session = get_object_or_404(AISession, session_id=data["session_id"])
        run = None
        if data.get("run_id"):
            run = AIChatRun.objects.filter(
                pk=data["run_id"], session=session
            ).first()

        object_key = artifact_storage.build_artifact_object_key(
            session.session_id, data["step"], data["filename"]
        )
        artifact_storage.store_artifact(
            content=content_bytes,
            object_key=object_key,
            content_type=data["content_type"],
        )

        checksum = artifact_storage.compute_checksum(content_bytes)
        with transaction.atomic():
            artifact, _created = AIArtifact.objects.update_or_create(
                session=session,
                step=data["step"],
                filename=data["filename"],
                defaults={
                    "run": run,
                    "object_key": object_key,
                    "content_type": data["content_type"],
                    "size_bytes": len(content_bytes),
                    "checksum": checksum,
                    "metadata": data.get("metadata") or {},
                },
            )

        return Response(
            AIArtifactSerializer(artifact).data,
            status=status.HTTP_201_CREATED,
        )

    def retrieve(self, request, pk=None):
        artifact = get_object_or_404(AIArtifact, pk=pk)
        return Response(AIArtifactSerializer(artifact).data)

    @action(detail=True, methods=["get"], url_path="content")
    def content(self, request, pk=None):
        artifact = get_object_or_404(AIArtifact, pk=pk)
        try:
            obj = artifact_storage.fetch_artifact(artifact.object_key)
        except artifact_storage.AIArtifactNotFoundError:
            return Response(
                {"detail": "artifact object missing in storage"},
                status=status.HTTP_410_GONE,
            )
        return HttpResponse(obj.content, content_type=obj.content_type)


class AIArtifactUserViewSet(viewsets.ReadOnlyModelViewSet):
    """User-facing read-only artifact view (Artifact Panel)."""

    permission_classes = [IsAuthenticated]
    serializer_class = AIArtifactSerializer

    def get_queryset(self):
        qs = AIArtifact.objects.filter(session__user=self.request.user)
        session_id = self.request.query_params.get("session_id")
        if session_id:
            qs = qs.filter(session_id=session_id)
        run_id = self.request.query_params.get("run_id")
        if run_id:
            qs = qs.filter(run_id=run_id)
        step = self.request.query_params.get("step")
        if step:
            qs = qs.filter(step=step)
        return qs

    @action(detail=False, methods=["post"], url_path="upload")
    def upload(self, request):
        """Upload user-provided artifact (csv/md) into current session."""
        session_id = (request.data.get("session_id") or "").strip()
        file_obj = request.FILES.get("file")
        if not session_id:
            return Response({"detail": "session_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        if file_obj is None:
            return Response({"detail": "file is required"}, status=status.HTTP_400_BAD_REQUEST)

        filename = os.path.basename((file_obj.name or "").strip())
        ext = os.path.splitext(filename)[1].lower()
        if ext not in _ALLOWED_UPLOAD_EXTS:
            return Response(
                {"detail": "Only .csv, .md and .json files are supported"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not _UPLOAD_FILENAME_RE.match(filename):
            return Response({"detail": "invalid filename"}, status=status.HTTP_400_BAD_REQUEST)

        content_type = (file_obj.content_type or "application/octet-stream").lower()
        if content_type not in _ALLOWED_UPLOAD_CONTENT_TYPES:
            if ext == ".csv":
                content_type = "text/csv"
            elif ext == ".json":
                content_type = "application/json"
            else:
                content_type = "text/markdown"

        content_bytes = file_obj.read()
        max_bytes = settings.AI_ARTIFACT_MAX_BYTES
        if len(content_bytes) > max_bytes:
            return Response(
                {"detail": f"file exceeds AI_ARTIFACT_MAX_BYTES={max_bytes}"},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )

        step = (request.data.get("step") or _USER_UPLOAD_STEP).strip()
        if not _UPLOAD_STEP_RE.match(step):
            return Response({"detail": "invalid step"}, status=status.HTTP_400_BAD_REQUEST)

        session = get_object_or_404(_user_session_qs(request.user), session_id=session_id)
        object_key = artifact_storage.build_artifact_object_key(
            session.session_id,
            step,
            filename,
        )
        artifact_storage.store_artifact(
            content=content_bytes,
            object_key=object_key,
            content_type=content_type,
        )
        checksum = artifact_storage.compute_checksum(content_bytes)
        with transaction.atomic():
            artifact, _ = AIArtifact.objects.update_or_create(
                session=session,
                step=step,
                filename=filename,
                defaults={
                    "run": None,
                    "object_key": object_key,
                    "content_type": content_type,
                    "size_bytes": len(content_bytes),
                    "checksum": checksum,
                    "metadata": {
                        "artifact_type": "user_upload",
                        "source": "composer_upload",
                    },
                },
            )
        return Response(AIArtifactSerializer(artifact).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="download")
    def download(self, request, pk=None):
        artifact = self.get_object()
        try:
            url = artifact_storage.build_presigned_download_url(artifact.object_key)
        except artifact_storage.AIArtifactStorageError:
            return Response(
                {"detail": "failed to presign artifact URL"},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({"url": url, "ttl": settings.MINIO_PRESIGNED_URL_TTL_SECONDS})

    @action(detail=True, methods=["get"], url_path="content")
    def content(self, request, pk=None):
        """Inline text preview (csv/md/json) for small artifacts."""
        artifact = self.get_object()
        if artifact.size_bytes > settings.AI_ARTIFACT_MAX_BYTES:
            return Response(
                {"detail": "artifact too large for inline preview"},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )
        try:
            obj = artifact_storage.fetch_artifact(artifact.object_key)
        except artifact_storage.AIArtifactNotFoundError:
            return Response(
                {"detail": "artifact object missing in storage"},
                status=status.HTTP_410_GONE,
            )
        return HttpResponse(obj.content, content_type=obj.content_type)
