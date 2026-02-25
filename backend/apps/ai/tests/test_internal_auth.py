import hashlib
import hmac
import time

from django.core.cache import cache
from django.test import RequestFactory, TestCase, override_settings

from apps.ai.internal_auth import HMACAuth, IsInternalService


class HMACAuthTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.path = "/api/v1/ai/internal/problem-actions/prepare"
        self.body = b'{"k":"v"}'
        cache.clear()

    def _build_headers(
        self,
        *,
        secret: str = "test-secret",
        service_id: str = "ai-service-01",
        timestamp: str | None = None,
        nonce: str = "nonce-1",
        signature: str | None = None,
    ) -> dict:
        ts = timestamp or str(int(time.time()))
        body_sha256 = hashlib.sha256(self.body).hexdigest()
        message = f"POST{self.path}{body_sha256}{ts}{nonce}"
        sig = signature or hmac.new(
            secret.encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        return {
            "HTTP_X_AI_SERVICE_ID": service_id,
            "HTTP_X_AI_TIMESTAMP": ts,
            "HTTP_X_AI_NONCE": nonce,
            "HTTP_X_AI_SIGNATURE": sig,
        }

    def _request(self, headers: dict | None = None):
        headers = headers or {}
        return self.factory.post(
            self.path,
            data=self.body,
            content_type="application/json",
            **headers,
        )

    @override_settings(
        AI_SERVICE_HMAC_SECRET="test-secret",
        AI_SERVICE_ALLOWED_IDS=["ai-service-01"],
    )
    def test_verify_request_success(self):
        req = self._request(self._build_headers())
        ok, err = HMACAuth.verify_request(req)
        self.assertTrue(ok)
        self.assertEqual(err, "")

    @override_settings(
        AI_SERVICE_HMAC_SECRET="test-secret",
        AI_SERVICE_ALLOWED_IDS=["ai-service-01"],
    )
    def test_verify_request_rejects_nonce_replay(self):
        headers = self._build_headers(nonce="nonce-replay")
        req1 = self._request(headers)
        req2 = self._request(headers)

        ok1, _ = HMACAuth.verify_request(req1)
        ok2, err2 = HMACAuth.verify_request(req2)

        self.assertTrue(ok1)
        self.assertFalse(ok2)
        self.assertEqual(err2, "Nonce replay detected")

    @override_settings(
        AI_SERVICE_HMAC_SECRET="test-secret",
        AI_SERVICE_ALLOWED_IDS=["ai-service-01"],
    )
    def test_verify_request_rejects_missing_headers(self):
        req = self._request()
        ok, err = HMACAuth.verify_request(req)
        self.assertFalse(ok)
        self.assertEqual(err, "Missing required HMAC headers")

    @override_settings(
        AI_SERVICE_HMAC_SECRET="test-secret",
        AI_SERVICE_ALLOWED_IDS=["ai-service-01"],
    )
    def test_verify_request_rejects_unknown_service(self):
        req = self._request(self._build_headers(service_id="unknown-service"))
        ok, err = HMACAuth.verify_request(req)
        self.assertFalse(ok)
        self.assertIn("Unknown service ID", err)

    @override_settings(
        AI_SERVICE_HMAC_SECRET="test-secret",
        AI_SERVICE_ALLOWED_IDS=["ai-service-01"],
    )
    def test_verify_request_rejects_invalid_timestamp(self):
        req = self._request(self._build_headers(timestamp="not-an-int"))
        ok, err = HMACAuth.verify_request(req)
        self.assertFalse(ok)
        self.assertEqual(err, "Invalid timestamp format")

    @override_settings(
        AI_SERVICE_HMAC_SECRET="test-secret",
        AI_SERVICE_ALLOWED_IDS=["ai-service-01"],
    )
    def test_verify_request_rejects_timestamp_drift(self):
        old_timestamp = str(int(time.time()) - 1000)
        req = self._request(self._build_headers(timestamp=old_timestamp))
        ok, err = HMACAuth.verify_request(req)
        self.assertFalse(ok)
        self.assertIn("Timestamp drift", err)

    @override_settings(
        AI_SERVICE_HMAC_SECRET="test-secret",
        AI_SERVICE_ALLOWED_IDS=["ai-service-01"],
    )
    def test_verify_request_rejects_signature_mismatch(self):
        req = self._request(self._build_headers(signature="0" * 64))
        ok, err = HMACAuth.verify_request(req)
        self.assertFalse(ok)
        self.assertEqual(err, "Signature mismatch")

    @override_settings(
        AI_SERVICE_HMAC_SECRET="",
        AI_SERVICE_ALLOWED_IDS=["ai-service-01"],
    )
    def test_verify_request_rejects_missing_secret(self):
        req = self._request(self._build_headers())
        ok, err = HMACAuth.verify_request(req)
        self.assertFalse(ok)
        self.assertEqual(err, "HMAC secret not configured")

    @override_settings(AI_SERVICE_HMAC_SECRET="test-secret")
    def test_sign_request_generates_valid_headers(self):
        headers = HMACAuth.sign_request("POST", self.path, self.body)
        req = self._request(headers)

        with override_settings(AI_SERVICE_ALLOWED_IDS=["ai-service-01"]):
            ok, err = HMACAuth.verify_request(req)
            self.assertTrue(ok)
            self.assertEqual(err, "")

    def test_permission_sets_error_message_on_failure(self):
        req = self._request()
        permission = IsInternalService()
        allowed = permission.has_permission(req, view=None)
        self.assertFalse(allowed)
        self.assertEqual(permission.message, "Missing required HMAC headers")
