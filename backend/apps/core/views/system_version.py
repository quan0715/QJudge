"""Operator-facing version and upgrade endpoints that proxy the host deploy agent."""

from rest_framework import serializers, status
from rest_framework.response import Response

from apps.core.api.envelope import contract_validation_error_response
from apps.core.services.deploy_agent import (
    AgentBusy,
    AgentTargetNotLatest,
    AgentUnavailable,
    agent_check_updates,
    agent_ingress,
    agent_start_upgrade,
    agent_status,
)
from apps.users.permissions import IsSuperAdmin
from apps.users.views.common import SchemaAPIView


def _unavailable(error: AgentUnavailable, *, http_status: int = status.HTTP_200_OK) -> Response:
    return Response({"agent": error.state, "detail": error.detail}, status=http_status)


class UpgradeRequestSerializer(serializers.Serializer):
    target = serializers.CharField(max_length=64)


class SystemVersionView(SchemaAPIView):
    """
    Deployed version, running upgrade job and its log (platform admin only).

    GET /api/v1/system/version

    A stack without a reachable agent still answers 200 with the agent state.
    """

    permission_classes = [IsSuperAdmin]
    serializer_class = serializers.Serializer

    def get(self, request):
        try:
            return Response({"agent": "ok", **agent_status()})
        except AgentUnavailable as error:
            return _unavailable(error)


class SystemVersionCheckView(SchemaAPIView):
    """
    Ask the agent which release is newest (platform admin only).

    POST /api/v1/system/version/check
    """

    permission_classes = [IsSuperAdmin]
    serializer_class = serializers.Serializer

    def post(self, request):
        try:
            return Response(agent_check_updates())
        except AgentUnavailable as error:
            return _unavailable(error, http_status=status.HTTP_503_SERVICE_UNAVAILABLE)


class SystemUpgradeView(SchemaAPIView):
    """
    Start an upgrade to the newest release (platform admin only).

    POST /api/v1/system/upgrade {"target": "<commit sha>"}

    The actor recorded on the job is always the signed-in user.
    """

    permission_classes = [IsSuperAdmin]
    serializer_class = serializers.Serializer

    def post(self, request):
        serializer = UpgradeRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return contract_validation_error_response(request, "target is required", serializer.errors)
        try:
            job = agent_start_upgrade(serializer.validated_data["target"], request.user.username)
        except AgentBusy:
            return Response({"error": "busy"}, status=status.HTTP_409_CONFLICT)
        except AgentTargetNotLatest as error:
            return Response(
                {"error": "not_latest", "latest": error.latest}, status=status.HTTP_400_BAD_REQUEST
            )
        except AgentUnavailable as error:
            return _unavailable(error, http_status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response(job, status=status.HTTP_202_ACCEPTED)


class SystemIngressView(SchemaAPIView):
    """
    Public entry points probed from the host (platform admin only).

    GET /api/v1/system/ingress
    """

    permission_classes = [IsSuperAdmin]
    serializer_class = serializers.Serializer

    def get(self, request):
        try:
            return Response({"agent": "ok", "entries": agent_ingress()})
        except AgentUnavailable as error:
            return _unavailable(error)
