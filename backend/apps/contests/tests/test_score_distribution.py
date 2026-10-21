from django.test import SimpleTestCase

from apps.contests.services.exam_scoring import build_score_distribution


def _counts(dist):
    return {b['range_label']: b['count'] for b in dist.buckets}


class BuildScoreDistributionTests(SimpleTestCase):
    def test_buckets_by_ratio_not_by_100_points(self):
        dist = build_score_distribution([270, 150, 30], 300)
        counts = _counts(dist)
        self.assertEqual(counts['90-100%'], 1)
        self.assertEqual(counts['50-59%'], 1)
        self.assertEqual(counts['10-19%'], 1)
        self.assertEqual(sum(counts.values()), 3)
        self.assertEqual(dist.average_score, 150.0)
        self.assertEqual(dist.median_score, 150.0)
        self.assertEqual(dist.max_total_score, 300)

    def test_zero_score_counts_in_first_bucket(self):
        self.assertEqual(_counts(build_score_distribution([0], 300))['0-9%'], 1)

    def test_zero_max_puts_everyone_in_first_bucket(self):
        self.assertEqual(_counts(build_score_distribution([5, 7], 0))['0-9%'], 2)

    def test_no_scores(self):
        dist = build_score_distribution([], 300)
        self.assertEqual(dist.average_score, 0)
        self.assertEqual(dist.median_score, 0)
        self.assertEqual(len(dist.buckets), 10)
        self.assertEqual(sum(b['count'] for b in dist.buckets), 0)
