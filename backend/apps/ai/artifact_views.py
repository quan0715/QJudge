"""Compatibility artifact routes backed exclusively by the AI Service."""

from __future__ import annotations

import base64
import os
from urllib.parse import urlencode

from django.conf import settings
from django.http import HttpResponse
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.users.permissions import IsTeacherOrAdmin

from .serializers import (
    ArtifactUploadSerializer,
    artifact_list_to_legacy,
    artifact_to_legacy,
)
from .services.ai_service_client import (
    AIServiceUnavailable,
    get_ai_service_client,
    safe_upstream_error,
    unavailable_error,
)
from .views import _proxy_json


_ALLOWED_UPLOAD_EXTS = {".csv", ".md", ".json", ".pdf"}
_CONTENT_TYPE_BY_EXT = {
    ".csv": "text/csv",
    ".md": "text/markdown",
    ".json": "application/json",
    ".pdf": "application/pdf",
}
_SAFE_RESPONSE_HEADERS = (
    "Content-Disposition",
    "X-Content-Type-Options",
    "Cache-Control",
)


class ArtifactViewSet(viewsets.ViewSet):
    permission_classes = [IsTeacherOrAdmin]
    serializer_class = serializers.Serializer

    def list(self, request):
        session_id = request.query_params.get("session_id")
        if not session_id:
            return Response(
                {"detail": "session_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        query = {"session_id": session_id}
        for name in ("step", "filename"):
            if value := request.query_params.get(name):
                query[name] = value
        path = f"/v1/artifacts?{urlencode(query)}"
        run_id = request.query_params.get("run_id")

        def map_list(data):
            mapped = artifact_list_to_legacy(data)
            if run_id:
                mapped["results"] = [
                    item for item in mapped["results"] if item["run_id"] == run_id
                ]
                mapped["count"] = len(mapped["results"])
            return mapped

        return _proxy_json(request, method="GET", path=path, mapper=map_list)

    def retrieve(self, request, pk=None):
        return _proxy_json(
            request,
            method="GET",
            path=f"/v1/artifacts/{pk}",
            mapper=artifact_to_legacy,
        )

    @action(detail=False, methods=["post"], url_path="upload")
    def upload(self, request):
        serializer = ArtifactUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        uploaded = serializer.validated_data["file"]
        filename = os.path.basename((uploaded.name or "").strip())
        extension = os.path.splitext(filename)[1].lower()
        if extension not in _ALLOWED_UPLOAD_EXTS:
            return Response(
                {"detail": "Only .csv, .md, .json and .pdf files are supported"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        content = uploaded.read()
        content_type = _CONTENT_TYPE_BY_EXT[extension]
        return _proxy_json(
            request,
            method="POST",
            path="/v1/artifacts",
            json_body={
                "session_id": str(serializer.validated_data["session_id"]),
                "produced_by_run_id": None,
                "step": serializer.validated_data["step"],
                "filename": filename,
                "content_type": content_type,
                "content_base64": base64.b64encode(content).decode("ascii"),
                "metadata": {
                    "artifact_type": "user_upload",
                    "source": "composer_upload",
                },
            },
            mapper=artifact_to_legacy,
        )

    @action(detail=True, methods=["get"], url_path="content")
    def content(self, request, pk=None):
        try:
            upstream = get_ai_service_client().request(
                "GET", f"/v1/artifacts/{pk}/content", request.user, request
            )
        except AIServiceUnavailable:
            return Response(
                unavailable_error(request), status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        if upstream.status_code >= 400:
            return Response(
                safe_upstream_error(upstream, request), status=upstream.status_code
            )
        response = HttpResponse(
            upstream.content,
            content_type=upstream.headers.get(
                "Content-Type", "application/octet-stream"
            ),
        )
        for header in _SAFE_RESPONSE_HEADERS:
            if value := upstream.headers.get(header):
                response[header] = value
        return response

    @action(detail=True, methods=["get"], url_path="download")
    def download(self, request, pk=None):
        try:
            upstream = get_ai_service_client().request(
                "GET", f"/v1/artifacts/{pk}/download", request.user, request
            )
        except AIServiceUnavailable:
            return Response(
                unavailable_error(request), status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        if upstream.status_code != status.HTTP_307_TEMPORARY_REDIRECT:
            if upstream.status_code >= 400:
                return Response(
                    safe_upstream_error(upstream, request), status=upstream.status_code
                )
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "AI_SERVICE_INVALID_RESPONSE",
                        "message": "AI Service returned an invalid download response.",
                        "retryable": True,
                        "request_id": getattr(request, "request_id", "unknown"),
                    },
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        location = upstream.headers.get("Location")
        if not location:
            return Response(
                {"detail": "AI Service did not provide a download URL"},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response(
            {
                "url": location,
                "ttl": settings.OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS,
            }
        )
