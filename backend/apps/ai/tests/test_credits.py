"""Tests for apps.ai.credits.usage_to_credits."""
from django.test import TestCase, override_settings

from apps.ai.credits import usage_to_credits


class UsageToCreditsTest(TestCase):
    def test_zero_tokens(self):
        self.assertEqual(usage_to_credits(0, 0, "deepseek-r1"), 0)
        self.assertEqual(usage_to_credits(None, None, "deepseek-v3"), 0)

    def test_default_r1_pricing_one_round(self):
        # 一輪對話 (2k in + 6k out) on R1:
        # cost_scaled = 2000*55 + 6000*219 = 110_000 + 1_314_000 = 1_424_000
        # credits = ceil(1_424_000 / 400_000) = 4
        self.assertEqual(usage_to_credits(2000, 6000, "deepseek-r1"), 4)

    def test_v3_is_cheaper_per_credit(self):
        # 同一輪對話 on V3:
        # cost_scaled = 2000*7 + 6000*28 = 14_000 + 168_000 = 182_000
        # credits = ceil(182_000 / 400_000) = 1
        self.assertEqual(usage_to_credits(2000, 6000, "deepseek-v3"), 1)

    def test_unknown_model_falls_back_to_default(self):
        r1 = usage_to_credits(2000, 6000, "deepseek-r1")
        unknown = usage_to_credits(2000, 6000, "unknown-model")
        none_model = usage_to_credits(2000, 6000, None)
        self.assertEqual(unknown, r1)
        self.assertEqual(none_model, r1)

    @override_settings(AI_CREDIT_SCALE_PER_CREDIT=200_000)
    def test_scale_halved_doubles_credits_roughly(self):
        # R1 一輪：1_424_000 / 200_000 = 7.12 → 8
        self.assertEqual(usage_to_credits(2000, 6000, "deepseek-r1"), 8)

    def test_input_only_still_charges(self):
        # R1 input only: 1_000_000 * 55 = 55_000_000; 55M/400k = 137.5 → 138
        self.assertEqual(usage_to_credits(1_000_000, 0, "deepseek-r1"), 138)

    def test_monthly_pro_budget_sanity(self):
        # Pro 2000 credits 對應 R1 大約 500 輪（2k/6k per round）
        one_round = usage_to_credits(2000, 6000, "deepseek-r1")
        self.assertEqual(one_round, 4)
        self.assertEqual(2000 // one_round, 500)
