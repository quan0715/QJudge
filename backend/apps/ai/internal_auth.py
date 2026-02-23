"""HMAC verification for internal service-to-service API calls."""

import hashlib
import hmac
import time
import uuid

from django.conf import settings
from django.core.cache import cache
from rest_framework.permissions import BasePermission


class HMACAuth:
    """Verify HMAC-SHA256 signatures on internal API requests."""

    TIMESTAMP_TOLERANCE = 120  # seconds
    NONCE_TTL = 120  # seconds
    NONCE_CACHE_PREFIX = "hmac_nonce:"

    @classmethod
    def verify_request(cls, request) -> tuple[bool, str]:
        """Verify HMAC signature. Returns (is_valid, error_message)."""
        service_id = request.META.get("HTTP_X_AI_SERVICE_ID")
        timestamp = request.META.get("HTTP_X_AI_TIMESTAMP")
        nonce = request.META.get("HTTP_X_AI_NONCE")
        signature = request.META.get("HTTP_X_AI_SIGNATURE")

        # Check required headers
        if not all([service_id, timestamp, nonce, signature]):
            return False, "Missing required HMAC headers"

        # Check service ID in allowlist
        allowed_ids = getattr(settings, "AI_SERVICE_ALLOWED_IDS", ["ai-service-1"])
        if service_id not in allowed_ids:
            return False, f"Unknown service ID: {service_id}"

        # Check timestamp drift
        try:
            ts = int(timestamp)
        except (ValueError, TypeError):
            return False, "Invalid timestamp format"

        drift = abs(time.time() - ts)
        if drift > cls.TIMESTAMP_TOLERANCE:
            return False, f"Timestamp drift {drift:.0f}s exceeds tolerance {cls.TIMESTAMP_TOLERANCE}s"

        # Check nonce replay
        nonce_key = f"{cls.NONCE_CACHE_PREFIX}{nonce}"
        if cache.get(nonce_key) is not None:
            return False, "Nonce replay detected"

        # Compute expected signature
        secret = getattr(settings, "AI_SERVICE_HMAC_SECRET", "")
        if not secret:
            return False, "HMAC secret not configured"

        method = request.method
        path = request.path
        body = request.body or b""
        body_sha256 = hashlib.sha256(body).hexdigest()
        message = f"{method}{path}{body_sha256}{timestamp}{nonce}"

        expected = hmac.new(
            secret.encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(expected, signature):
            return False, "Signature mismatch"

        # Mark nonce as used
        cache.set(nonce_key, 1, cls.NONCE_TTL)

        return True, ""

    @classmethod
    def sign_request(cls, method: str, path: str, body: bytes) -> dict[str, str]:
        """Generate HMAC signature headers (for testing)."""
        secret = getattr(settings, "AI_SERVICE_HMAC_SECRET", "")
        timestamp = str(int(time.time()))
        nonce = uuid.uuid4().hex
        body_sha256 = hashlib.sha256(body).hexdigest()
        message = f"{method}{path}{body_sha256}{timestamp}{nonce}"

        signature = hmac.new(
            secret.encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        return {
            "HTTP_X_AI_SERVICE_ID": "ai-service-01",
            "HTTP_X_AI_TIMESTAMP": timestamp,
            "HTTP_X_AI_NONCE": nonce,
            "HTTP_X_AI_SIGNATURE": signature,
        }


class IsInternalService(BasePermission):
    """DRF permission class for HMAC-authenticated internal requests."""

    def has_permission(self, request, view):
        is_valid, error_msg = HMACAuth.verify_request(request)
        if not is_valid:
            self.message = error_msg
        return is_valid
