import logging

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status
from django.conf import settings

from .models import Subscription
from .serializers import SubscriptionSerializer, CheckoutSessionSerializer
from .sync import sync_subscription_from_recur
from .recur_client import create_portal_session

logger = logging.getLogger(__name__)


class CurrentSubscriptionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        sub, _ = Subscription.objects.get_or_create(user=request.user)
        sub = sync_subscription_from_recur(sub)
        return Response({
            "success": True,
            "data": SubscriptionSerializer(sub).data,
        })


class CheckoutSessionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = CheckoutSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        slug = serializer.validated_data["product_slug"]
        product_id_map = {
            "pro": settings.RECUR_PRODUCT_PRO_ID,
            "team": settings.RECUR_PRODUCT_TEAM_ID,
        }

        return Response({
            "success": True,
            "data": {
                "publishable_key": settings.RECUR_PUBLISHABLE_KEY,
                "product_id": product_id_map[slug],
                "customer_email": request.user.email,
            },
        })


class PortalSessionView(APIView):
    """POST /api/v1/subscriptions/portal/ — create Recur customer portal session."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not settings.RECUR_SECRET_KEY:
            return Response(
                {"success": False, "error": {"message": "Payment not configured"}},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        frontend_url = settings.FRONTEND_URL or "http://localhost:5173"
        data = create_portal_session(
            email=request.user.email,
            return_url=f"{frontend_url}/settings",
        )

        if data and data.get("url"):
            return Response({
                "success": True,
                "data": {"url": data["url"]},
            })

        return Response(
            {"success": False, "error": {"message": "Failed to create portal session"}},
            status=status.HTTP_502_BAD_GATEWAY,
        )
