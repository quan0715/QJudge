"""Tests for the AI credit endpoint."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.ai.models import UserAICredit

User = get_user_model()

CREDIT_URL = "/api/v1/ai/sessions/credit/"


class CreditEndpointTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="credituser", email="credit@example.com", password="testpass"
        )

    def test_requires_authentication(self):
        response = self.client.get(CREDIT_URL)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_returns_zero_defaults_on_first_call(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(CREDIT_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_input_tokens"], 0)
        self.assertEqual(response.data["total_output_tokens"], 0)
        self.assertEqual(response.data["total_requests"], 0)
        self.assertEqual(response.data["total_cost_cents"], 0)
        self.assertEqual(float(response.data["total_cost_usd"]), 0.0)
        self.assertEqual(response.data["total_credits"], 0)

    def test_response_shape(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(CREDIT_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        expected_keys = {
            "total_credits",
            "total_input_tokens",
            "total_output_tokens",
            "total_requests",
            "total_cost_cents",
            "total_cost_usd",
            "updated_at",
        }
        self.assertEqual(set(response.data.keys()), expected_keys)

    def test_reflects_accumulated_usage(self):
        self.client.force_authenticate(user=self.user)
        UserAICredit.objects.create(
            user=self.user,
            total_input_tokens=1000,
            total_output_tokens=200,
            total_requests=3,
            total_cost_cents=5,
            total_credits=2,
        )
        response = self.client.get(CREDIT_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_input_tokens"], 1000)
        self.assertEqual(response.data["total_output_tokens"], 200)
        self.assertEqual(response.data["total_requests"], 3)
        self.assertEqual(response.data["total_cost_cents"], 5)
        self.assertEqual(response.data["total_credits"], 2)
