"""Sync local Subscription model with Recur API."""

import logging

from django.conf import settings

from .models import Subscription
from .recur_client import fetch_customer_by_email

logger = logging.getLogger(__name__)

PRODUCT_ID_TO_TIER = None  # Lazy-built


def _get_product_tier_map() -> dict[str, str]:
    global PRODUCT_ID_TO_TIER
    if PRODUCT_ID_TO_TIER is None:
        PRODUCT_ID_TO_TIER = {
            settings.RECUR_PRODUCT_PRO_ID: "pro",
            settings.RECUR_PRODUCT_TEAM_ID: "team",
        }
    return PRODUCT_ID_TO_TIER


def _recur_status_to_local(recur_status: str) -> str:
    """Map Recur subscription status strings to our local status choices."""
    mapping = {
        "ACTIVE": "active",
        "TRIALING": "trialing",
        "PAST_DUE": "past_due",
        "CANCELED": "cancelled",
        "CANCELLED": "cancelled",
        "EXPIRED": "expired",
        "INCOMPLETE": "past_due",
    }
    return mapping.get(recur_status.upper(), recur_status.lower())


def sync_subscription_from_recur(sub: Subscription) -> Subscription:
    """
    Fetch the user's subscription status from Recur API and update local DB.
    Falls back to local DB data silently if Recur API is unavailable.
    """
    email = sub.user.email
    if not email or not settings.RECUR_SECRET_KEY:
        return sub

    data = fetch_customer_by_email(email)
    if data is None:
        return sub  # API unreachable, return local data as-is

    # Parse the Recur response
    customer = data.get("customer") or data
    subscriptions = (
        data.get("subscriptions")
        or customer.get("subscriptions")
        or []
    )

    if not subscriptions:
        # Customer exists in Recur but has no subscriptions
        if sub.recur_customer_id or sub.tier != "free":
            sub.tier = "free"
            sub.status = "active"
            sub.recur_subscription_id = ""
            sub.recur_product_id = ""
            sub.current_period_end = None
            sub.trial_end = None
            sub.save()
        return sub

    # Pick the most relevant subscription (active > trialing > others)
    priority = {"ACTIVE": 0, "TRIALING": 1, "PAST_DUE": 2}
    subscriptions.sort(key=lambda s: priority.get(s.get("status", "").upper(), 99))
    recur_sub = subscriptions[0]

    recur_sub_id = recur_sub.get("id", "")
    recur_status = _recur_status_to_local(recur_sub.get("status", "active"))

    product = recur_sub.get("product", {})
    product_id = product.get("id", "") if isinstance(product, dict) else str(product)
    tier = _get_product_tier_map().get(product_id, "free")

    customer_id = (
        customer.get("id", "")
        if isinstance(customer, dict)
        else str(customer)
    )

    # Detect changes
    changed = (
        sub.recur_subscription_id != recur_sub_id
        or sub.tier != tier
        or sub.status != recur_status
        or sub.recur_customer_id != customer_id
        or sub.recur_product_id != product_id
    )

    if changed:
        sub.recur_subscription_id = recur_sub_id
        sub.recur_customer_id = customer_id
        sub.recur_product_id = product_id
        sub.tier = tier
        sub.status = recur_status
        sub.current_period_end = recur_sub.get("currentPeriodEnd") or recur_sub.get("current_period_end")
        sub.trial_end = recur_sub.get("trialEnd") or recur_sub.get("trial_end")
        sub.save()
        logger.info("Synced subscription for %s: tier=%s status=%s", email, tier, recur_status)

    return sub
