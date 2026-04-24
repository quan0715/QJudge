"""Tests for apps.ai.credits.usage_to_credits."""
from django.test import TestCase, override_settings

from apps.ai.credits import usage_to_credits


class UsageToCreditsTest(TestCase):
    def test_zero_tokens(self):
        self.assertEqual(usage_to_credits(0, 0, "deepseek-v4"), 0)
        self.assertEqual(usage_to_credits(None, None, "deepseek-v4"), 0)

    def test_default_v4_pricing_one_round(self):
        # 一輪對話 (2k in + 6k out) on V4-flash:
        # cost_scaled = 2000*14 + 6000*28 = 28_000 + 168_000 = 196_000
        # credits = ceil(196_000 / 400_000) = 1
        self.assertEqual(usage_to_credits(2000, 6000, "deepseek-v4"), 1)

    def test_unknown_model_falls_back_to_default(self):
        default_model = usage_to_credits(2000, 6000, "openai-nano")
        unknown = usage_to_credits(2000, 6000, "unknown-model")
        none_model = usage_to_credits(2000, 6000, None)
        self.assertEqual(unknown, default_model)
        self.assertEqual(none_model, default_model)

    @override_settings(AI_CREDIT_SCALE_PER_CREDIT=50_000)
    def test_scale_tightened_increases_credits(self):
        # V4 一輪：196_000 / 50_000 = 3.92 → 4
        self.assertEqual(usage_to_credits(2000, 6000, "deepseek-v4"), 4)

    def test_input_only_still_charges(self):
        # V4 input only: 1_000_000 * 14 = 14_000_000; 14M/400k = 35
        self.assertEqual(usage_to_credits(1_000_000, 0, "deepseek-v4"), 35)

    def test_monthly_pro_budget_sanity(self):
        # Pro 2000 credits 對應 V4 約 2000 輪（2k/6k per round）
        one_round = usage_to_credits(2000, 6000, "deepseek-v4")
        self.assertEqual(one_round, 1)
        self.assertEqual(2000 // one_round, 2000)
