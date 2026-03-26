"""Lightweight Recur REST API client (no external dependencies)."""

import json
import logging
import urllib.request
import urllib.error

from django.conf import settings

logger = logging.getLogger(__name__)

RECUR_API_BASE = "https://api.recur.tw/v1"


def _recur_get(path: str) -> dict | None:
    """GET request to Recur API. Returns parsed JSON or None on failure."""
    secret_key = settings.RECUR_SECRET_KEY
    if not secret_key:
        return None

    req = urllib.request.Request(
        f"{RECUR_API_BASE}{path}",
        headers={
            "Authorization": f"Bearer {secret_key}",
            "Content-Type": "application/json",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        logger.warning("Recur API %s failed: %s %s", path, e.code, body)
        return None
    except Exception:
        logger.exception("Recur API %s unexpected error", path)
        return None


def _recur_post(path: str, payload: dict) -> dict | None:
    """POST request to Recur API. Returns parsed JSON or None on failure."""
    secret_key = settings.RECUR_SECRET_KEY
    if not secret_key:
        return None

    req = urllib.request.Request(
        f"{RECUR_API_BASE}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {secret_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        logger.warning("Recur API POST %s failed: %s %s", path, e.code, body)
        return None
    except Exception:
        logger.exception("Recur API POST %s unexpected error", path)
        return None


def fetch_customer_by_email(email: str) -> dict | None:
    """Fetch customer + subscriptions from Recur by email."""
    return _recur_get(f"/customers?email={urllib.request.quote(email)}")


def create_portal_session(email: str, return_url: str) -> dict | None:
    """Create a Recur customer portal session."""
    return _recur_post("/portal/sessions", {
        "email": email,
        "return_url": return_url,
    })
