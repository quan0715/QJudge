"""Permission-preserving compatibility BFF for the autonomous AI Service."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from django.http import StreamingHttpResponse
from rest_framework import generics, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.users.permissions import IsTeacherOrAdmin

from .serializers import (
    CreateSessionSerializer,
    ModelInfoSerializer,
    RenameSessionSerializer,
    RunAnswerSerializer,
    RunApprovalSerializer,
    StartRunSerializer,
    UpdateSessionSerializer,
    run_list_to_legacy,
    run_to_legacy,
    session_list_to_legacy,
    session_to_legacy,
)
from .services.ai_service_client import (
    AIServiceUnavailable,
    AIServiceUpstreamResponse,
    get_ai_service_client,
    safe_upstream_error,
    unavailable_error,
)


JsonMapper = Callable[[dict[str, Any]], object]


def _invalid_response(request) -> Response:
    return Response(
        {
            "success": False,
            "error": {
                "code": "AI_SERVICE_INVALID_RESPONSE",
                "message": "AI Service returned an invalid response.",
                "retryable": True,
                "request_id": getattr(request, "request_id", "unknown"),
            },
        },
        status=status.HTTP_502_BAD_GATEWAY,
    )


def _proxy_json(
    request,
    *,
    method: str,
    path: str,
    json_body: object | None = None,
    mapper: JsonMapper | None = None,
) -> Response:
    try:
        upstream = get_ai_service_client().request(
            method, path, request.user, request, json_body
        )
    except AIServiceUnavailable:
        return Response(
            unavailable_error(request), status=status.HTTP_503_SERVICE_UNAVAILABLE
        )
    if upstream.status_code >= 400:
        return Response(
            safe_upstream_error(upstream, request), status=upstream.status_code
        )
    if upstream.status_code == status.HTTP_204_NO_CONTENT:
        return Response(status=status.HTTP_204_NO_CONTENT)
    try:
        payload = upstream.json()
    except (ValueError, UnicodeDecodeError):
        return _invalid_response(request)
    if mapper is not None:
        try:
            payload = mapper(payload)
        except (KeyError, TypeError, ValueError):
            return _invalid_response(request)
    return Response(payload, status=upstream.status_code)


class SchemaAPIView(generics.GenericAPIView):
    serializer_class = serializers.Serializer


class AISessionViewSet(viewsets.ViewSet):
    permission_classes = [IsTeacherOrAdmin]
    serializer_class = CreateSessionSerializer

    def list(self, request):
        return _proxy_json(
            request,
            method="GET",
            path="/v1/sessions",
            mapper=lambda data: session_list_to_legacy(data, user_id=request.user.pk),
        )

    def create(self, request):
        serializer = CreateSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return _proxy_json(
            request,
            method="POST",
            path="/v1/sessions",
            json_body={"context": serializer.validated_data["context"]},
            mapper=lambda data: session_to_legacy(
                data, user_id=request.user.pk, include_messages=False
            ),
        )

    @action(detail=False, methods=["post"])
    def new_session(self, request):
        serializer = CreateSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        response = _proxy_json(
            request,
            method="POST",
            path="/v1/sessions",
            json_body={"context": serializer.validated_data["context"]},
            mapper=lambda data: {"id": str(data["session_id"]), "status": "pending"},
        )
        if response.status_code == status.HTTP_201_CREATED:
            response.status_code = status.HTTP_200_OK
        return response

    def retrieve(self, request, pk=None):
        # DefaultRouter would otherwise interpret the removed legacy credit
        # endpoint as a session primary key.
        if pk == "credit":
            return Response(status=status.HTTP_404_NOT_FOUND)
        return _proxy_json(
            request,
            method="GET",
            path=f"/v1/sessions/{pk}",
            mapper=lambda data: session_to_legacy(
                data, user_id=request.user.pk, include_messages=True
            ),
        )

    def update(self, request, pk=None):
        update_data = dict(request.data)
        context = request.data.get("context")
        if "title" not in update_data and isinstance(context, dict):
            if context_title := context.get("title"):
                update_data["title"] = context_title
        serializer = UpdateSessionSerializer(data=update_data)
        serializer.is_valid(raise_exception=True)
        body = {
            key: value
            for key, value in serializer.validated_data.items()
            if key in {"title", "context", "context_mode"}
        }
        if "context" not in body:
            body.pop("context_mode", None)
        return _proxy_json(
            request,
            method="PATCH",
            path=f"/v1/sessions/{pk}",
            json_body=body,
            mapper=lambda data: session_to_legacy(
                data, user_id=request.user.pk, include_messages=False
            ),
        )

    partial_update = update

    @action(detail=True, methods=["post"])
    def rename(self, request, pk=None):
        serializer = RenameSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return self._rename(request, pk, serializer.validated_data["title"])

    def _rename(self, request, session_id, title: str):
        return _proxy_json(
            request,
            method="PATCH",
            path=f"/v1/sessions/{session_id}",
            json_body={"title": title},
            mapper=lambda data: session_to_legacy(
                data, user_id=request.user.pk, include_messages=False
            ),
        )

    @action(detail=True, methods=["post"])
    def clear(self, request, pk=None):
        return _proxy_json(
            request,
            method="POST",
            path=f"/v1/sessions/{pk}/clear",
            json_body={},
            mapper=lambda data: session_to_legacy(
                data, user_id=request.user.pk, include_messages=True
            ),
        )

    @action(detail=True, methods=["get"])
    def context(self, request, pk=None):
        return _proxy_json(
            request,
            method="GET",
            path=f"/v1/sessions/{pk}",
            mapper=lambda data: {
                "session_id": str(data["session_id"]),
                "context": data.get("context") or {},
            },
        )

    def destroy(self, request, pk=None):
        return _proxy_json(
            request,
            method="DELETE",
            path=f"/v1/sessions/{pk}",
        )

    @action(detail=True, methods=["post"], url_path="runs")
    def runs(self, request, pk=None):
        serializer = StartRunSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return _proxy_json(
            request,
            method="POST",
            path=f"/v1/sessions/{pk}/runs",
            json_body={
                "message": serializer.validated_data["content"],
                "model_id": serializer.validated_data["model_id"],
            },
            mapper=run_to_legacy,
        )


class AIChatRunViewSet(viewsets.ViewSet):
    permission_classes = [IsTeacherOrAdmin]
    serializer_class = serializers.Serializer

    def list(self, request):
        return _proxy_json(
            request,
            method="GET",
            path="/v1/runs?status=active",
            mapper=run_list_to_legacy,
        )

    def retrieve(self, request, pk=None):
        return _proxy_json(
            request,
            method="GET",
            path=f"/v1/runs/{pk}",
            mapper=run_to_legacy,
        )

    @action(detail=True, methods=["get"])
    def events(self, request, pk=None):
        query = {}
        if "after" in request.query_params:
            query["after"] = request.query_params["after"]
        try:
            chunks = get_ai_service_client().stream(
                f"/v1/runs/{pk}/events",
                request.user,
                request,
                query,
            )
        except AIServiceUnavailable:
            return Response(
                unavailable_error(request), status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        except AIServiceUpstreamResponse as exc:
            return Response(
                safe_upstream_error(exc.response, request),
                status=exc.response.status_code,
            )
        response = StreamingHttpResponse(chunks, content_type="text/event-stream")
        response["Cache-Control"] = "no-cache, no-transform"
        response["X-Accel-Buffering"] = "no"
        return response

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        return _proxy_json(
            request,
            method="POST",
            path=f"/v1/runs/{pk}/cancel",
            json_body={},
            mapper=run_to_legacy,
        )

    @action(detail=True, methods=["post"])
    def approval(self, request, pk=None):
        serializer = RunApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return _proxy_json(
            request,
            method="POST",
            path=f"/v1/runs/{pk}/approve",
            json_body={"decision": serializer.validated_data["decision"]},
            mapper=run_to_legacy,
        )

    @action(detail=True, methods=["post"])
    def answer(self, request, pk=None):
        serializer = RunAnswerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return _proxy_json(
            request,
            method="POST",
            path=f"/v1/runs/{pk}/answer",
            json_body={"answer": serializer.validated_data["answer"]},
            mapper=run_to_legacy,
        )


class ModelListView(SchemaAPIView):
    permission_classes = [IsTeacherOrAdmin]
    serializer_class = ModelInfoSerializer

    def get(self, request):
        return _proxy_json(request, method="GET", path="/v1/models")


class UsageView(SchemaAPIView):
    permission_classes = [IsTeacherOrAdmin]

    def get(self, request):
        return _proxy_json(request, method="GET", path="/v1/usage")
