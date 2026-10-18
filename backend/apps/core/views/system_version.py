"""Operator-facing version and upgrade endpoints that proxy the host deploy agent."""

from rest_framework import serializers, status
from rest_framework.response import Response

from apps.core.api.envelope import contract_error_response, contract_validation_error_response
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


def _unavailable_data(error: AgentUnavailable) -> Response:
    """Reads that can still render: the page shows the agent state instead of an error."""
    return Response({"agent": error.state, "detail": error.detail})


def _unavailable_error(request, error: AgentUnavailable) -> Response:
    return contract_error_response(
        request,
        "agent_unavailable",
        "無法使用主機 agent",
        status=status.HTTP_503_SERVICE_UNAVAILABLE,
        details={"agent": error.state, "detail": error.detail},
    )


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
            return _unavailable_data(error)


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
            return _unavailable_error(request, error)


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
            return contract_error_response(
                request, "agent_busy", "另一個更新正在進行", status=status.HTTP_409_CONFLICT
            )
        except AgentTargetNotLatest as error:
            return contract_error_response(
                request,
                "not_latest",
                "追蹤分支已有更新的版本",
                status=status.HTTP_400_BAD_REQUEST,
                details={"latest": error.latest},
            )
        except AgentUnavailable as error:
            return _unavailable_error(request, error)
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
            return _unavailable_data(error)
