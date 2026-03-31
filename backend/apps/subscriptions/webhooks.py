import hmac
import hashlib
import json
import logging

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.conf import settings
from django.utils import timezone

from apps.users.models import User
from .models import Subscription, WebhookEvent

logger = logging.getLogger(__name__)


def verify_signature(payload: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(signature, expected)


@csrf_exempt
@require_POST
def recur_webhook(request):
    payload = request.body
    signature = request.META.get("HTTP_X_RECUR_SIGNATURE", "")

    if not signature or not verify_signature(payload, signature, settings.RECUR_WEBHOOK_SECRET):
        return JsonResponse({"error": "Invalid signature"}, status=401)

    event = json.loads(payload)
    event_id = event.get("id", "")
    event_type = event.get("type", "")

    if WebhookEvent.objects.filter(event_id=event_id).exists():
        return JsonResponse({"received": True, "duplicate": True})

    WebhookEvent.objects.create(
        event_id=event_id,
        event_type=event_type,
        payload=event,
    )

    data = event.get("data", {})
    handler = EVENT_HANDLERS.get(event_type)
    if handler:
        try:
            handler(data)
        except Exception:
            logger.exception(f"Error handling webhook event {event_type} ({event_id})")

    return JsonResponse({"received": True})


def _get_or_create_subscription(customer_email: str):
    try:
        user = User.objects.get(email=customer_email)
    except User.DoesNotExist:
        logger.warning(f"Webhook: no user found for email {customer_email}")
        return None
    sub, _ = Subscription.objects.get_or_create(user=user)
    return sub


def _product_id_to_tier(product_id: str) -> str:
    mapping = {
        settings.RECUR_PRODUCT_PRO_ID: "pro",
        settings.RECUR_PRODUCT_TEAM_ID: "team",
    }
    return mapping.get(product_id, "free")


def handle_checkout_completed(data):
    customer = data.get("customer", {})
    email = customer.get("email", "")
    sub = _get_or_create_subscription(email)
    if sub:
        sub.recur_customer_id = customer.get("id", "")
        sub.save(update_fields=["recur_customer_id", "updated_at"])


def handle_subscription_activated(data):
    customer = data.get("customer", {})
    email = customer.get("email", "")
    sub = _get_or_create_subscription(email)
    if not sub:
        return
    product = data.get("product", {})
    sub.tier = _product_id_to_tier(product.get("id", ""))
    sub.status = data.get("status", "active")
    sub.recur_subscription_id = data.get("id", "")
    sub.recur_customer_id = customer.get("id", "")
    sub.recur_product_id = product.get("id", "")
    sub.current_period_end = data.get("currentPeriodEnd")
    sub.trial_end = data.get("trialEnd")
    sub.save()


def handle_subscription_cancelled(data):
    sub_id = data.get("id", "")
    try:
        sub = Subscription.objects.get(recur_subscription_id=sub_id)
    except Subscription.DoesNotExist:
        return
    sub.status = "cancelled"
    sub.cancelled_at = timezone.now()
    sub.save(update_fields=["status", "cancelled_at", "updated_at"])


def handle_subscription_expired(data):
    sub_id = data.get("id", "")
    try:
        sub = Subscription.objects.get(recur_subscription_id=sub_id)
    except Subscription.DoesNotExist:
        return
    sub.status = "expired"
    sub.tier = "free"
    sub.save(update_fields=["status", "tier", "updated_at"])


def handle_subscription_past_due(data):
    sub_id = data.get("id", "")
    try:
        sub = Subscription.objects.get(recur_subscription_id=sub_id)
    except Subscription.DoesNotExist:
        return
    sub.status = "past_due"
    sub.save(update_fields=["status", "updated_at"])


def handle_invoice_paid(data):
    subscription_data = data.get("subscription", {})
    sub_id = subscription_data.get("id", "") if isinstance(subscription_data, dict) else subscription_data
    try:
        sub = Subscription.objects.get(recur_subscription_id=sub_id)
    except Subscription.DoesNotExist:
        return
    sub.status = "active"
    sub.current_period_end = data.get("periodEnd")
    sub.save(update_fields=["status", "current_period_end", "updated_at"])


def handle_invoice_payment_failed(data):
    subscription_data = data.get("subscription", {})
    sub_id = subscription_data.get("id", "") if isinstance(subscription_data, dict) else subscription_data
    try:
        sub = Subscription.objects.get(recur_subscription_id=sub_id)
    except Subscription.DoesNotExist:
        return
    sub.status = "past_due"
    sub.save(update_fields=["status", "updated_at"])


EVENT_HANDLERS = {
    "checkout.completed": handle_checkout_completed,
    "subscription.created": handle_subscription_activated,
    "subscription.activated": handle_subscription_activated,
    "subscription.cancelled": handle_subscription_cancelled,
    "subscription.expired": handle_subscription_expired,
    "subscription.past_due": handle_subscription_past_due,
    "invoice.paid": handle_invoice_paid,
    "invoice.payment_failed": handle_invoice_payment_failed,
}
