"""Operator-facing service status endpoint."""

from rest_framework import serializers
from rest_framework.response import Response

from apps.core.services.service_status import build_service_status_report
from apps.users.permissions import IsSuperAdmin
from apps.users.views.common import SchemaAPIView


class ServiceStatusView(SchemaAPIView):
    """
    Live status of the platform's own services (platform admin only).

    GET /api/v1/system/service-status
    """

    permission_classes = [IsSuperAdmin]
    serializer_class = serializers.Serializer

    def get(self, request):
        return Response(build_service_status_report())
