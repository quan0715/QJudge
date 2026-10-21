from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.contests.models import Contest
from apps.contests.services.scoreboard import ScoreboardResult

User = get_user_model()


class CodingDashboardSummaryTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.teacher = User.objects.create_user(
            username='teacher', email='teacher@test.com', password='pass',
            is_staff=True, role='admin',
        )
        self.student = User.objects.create_user(
            username='student', email='student@test.com', password='pass',
        )
        self.contest = Contest.objects.create(
            name='Coding Contest',
            owner=self.teacher,
            contest_type='coding',
            status='published',
            results_published=False,
        )
        self.url = reverse(
            'contests:contest-exam-answers-dashboard-summary',
            kwargs={'contest_pk': self.contest.id},
        )
        self.scoreboard_result = ScoreboardResult(
            problems=[{'score': 100}, {'score': 200}],
            standings=[
                {'user': {'id': 1}, 'total_score': 300, 'has_finished_exam': True},
                {'user': {'id': 2}, 'total_score': 150, 'has_finished_exam': False},
                {'user': {'id': 3}, 'total_score': 0, 'has_finished_exam': True},
            ],
        )

    def _patch_scoreboard(self):
        return patch(
            'apps.contests.services.coding_result_summary.ScoreboardService.calculate',
            return_value=self.scoreboard_result,
        )

    def test_coding_summary_uses_scoreboard_totals_and_ratio_buckets(self):
        self.client.force_authenticate(user=self.teacher)

        with self._patch_scoreboard():
            response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data['contest']['id'], str(self.contest.id))
        self.assertEqual(data['contest']['contest_type'], 'coding')
        self.assertEqual(data['contest']['participant_count'], 3)
        self.assertEqual(data['contest']['completed_count'], 2)
        self.assertEqual(data['summary']['max_total_score'], 300)
        self.assertEqual(data['summary']['average_score'], 150.0)
        self.assertEqual(data['summary']['median_score'], 150.0)
        counts = {b['range_label']: b['count'] for b in data['score_distribution']}
        self.assertEqual(len(data['score_distribution']), 10)
        self.assertEqual(counts['90-100%'], 1)
        self.assertEqual(counts['50-59%'], 1)
        self.assertEqual(counts['0-9%'], 1)
        self.assertEqual(data['questions'], [])

    def test_student_cannot_view_coding_summary_before_publish(self):
        self.client.force_authenticate(user=self.student)

        with self._patch_scoreboard():
            response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
