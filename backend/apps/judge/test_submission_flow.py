"""Real PostgreSQL + Docker coverage for persisted scores and ad-hoc runs.

Runs in the judge CI job, which provides both a test database and Docker.
The browser suite separately exercises asynchronous Celery dispatch.
"""
from datetime import timedelta
from unittest.mock import patch

import docker
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.contests.models import Contest
from apps.contests.tests import bind_problem_to_contest
from apps.problems.models import CodingProblem, TestCase as ProblemCase
from apps.problems.test_run_service import ProblemTestRunService
from apps.submissions.models import Submission, SubmissionResult
from apps.submissions.tasks import judge_submission


SUM = '#include <cstdio>\nint main(){int a,b;scanf("%d%d",&a,&b);printf("%d",a+b);}'
PARTIAL = '#include <cstdio>\nint main(){puts("3");}'


class SubmissionScoringIntegrationTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="judge-session-scores", email="scores@example.test", role="teacher",
        )
        self.problem = CodingProblem.objects.create(
            slug="judge-session-scores", created_by=self.user, time_limit=1000, memory_limit=256,
        )
        for order, inp, out, weight in [(0, "1 2\n", "3", 30), (1, "8 9\n", "17", 70)]:
            ProblemCase.objects.create(
                problem=self.problem, input_data=inp, output_data=out,
                is_sample=order == 0, is_hidden=order == 1,
                weight_percent=weight, order=order,
            )
        self.contest = Contest.objects.create(
            name="Judge session score integration", owner=self.user, contest_type="coding",
            start_time=timezone.now() - timedelta(minutes=1),
            end_time=timezone.now() + timedelta(hours=1), status="published",
        )
        self.binding = bind_problem_to_contest(self.contest, self.problem, score=80)
        self.containers = []
        collection = docker.models.containers.ContainerCollection
        create = collection.create

        def record_create(client, **kwargs):
            container = create(client, **kwargs)
            self.containers.append(container)
            return container

        self.recorder = patch.object(collection, "create", record_create)
        self.recorder.start()
        self.addCleanup(self.recorder.stop)

    def submit(self, code):
        submission = Submission.objects.create(
            user=self.user, problem=self.problem, language="cpp", code=code,
            contest=self.contest, contest_question_binding=self.binding,
        )
        judge_submission.run(submission.id)
        submission.refresh_from_db()
        return submission

    def assert_containers_removed(self, expected):
        self.assertEqual(len(self.containers), expected)
        self.assertEqual(len({c.id for c in self.containers}), expected)
        for container in self.containers:
            with self.assertRaises(docker.errors.NotFound):
                container.reload()

    def test_contest_full_and_partial_scores_are_persisted(self):
        for code, verdict, score, statuses in [
            (SUM, "AC", 80, ["AC", "AC"]), (PARTIAL, "WA", 24, ["AC", "WA"]),
        ]:
            submission = self.submit(code)
            self.assertEqual((submission.status, submission.score), (verdict, score))
            results = list(submission.results.order_by("test_case__order"))
            self.assertEqual([r.status for r in results], statuses)
            self.assertEqual([r.is_hidden for r in results], [False, True])
            self.assertEqual([r.input_data for r in results], ["1 2\n", "8 9\n"])
            self.assertEqual(submission.exec_time, max(r.exec_time for r in results))
        self.assert_containers_removed(2)

    def test_ce_re_tle_and_wa_save_zero_score_and_expected_case_results(self):
        for code, status, count in [
            ("invalid C++", "CE", 1),
            ("int main(){return 2;}", "RE", 2),
            ("int main(){for(;;){}}", "TLE", 2),
            ('#include <cstdio>\nint main(){puts("wrong");}', "WA", 2),
        ]:
            with self.subTest(status=status):
                submission = self.submit(code)
                self.assertEqual((submission.status, submission.score), (status, 0))
                self.assertEqual(list(submission.results.values_list("status", flat=True)), [status] * count)
                if status == "CE":
                    self.assertTrue(submission.error_message)
                    self.assertEqual(submission.exec_time, 0)
        self.assert_containers_removed(4)

    def test_test_run_uses_only_public_and_custom_cases_without_saving_scores(self):
        progress = []
        result = ProblemTestRunService.run(
            problem=self.problem, language="cpp", source_code=SUM,
            custom_test_cases=[{"input": "10 20\n", "expected_output": "30"}],
            on_progress=progress.append,
        )
        self.assertEqual(result["status"], "AC")
        self.assertEqual([r["output"] for r in result["results"]], ["3", "30"])
        self.assertEqual([r["source"] for r in result["results"]], ["sample", "custom"])
        self.assertTrue(all(not r["is_hidden"] for r in result["results"]))
        self.assertEqual([len(p["results"]) for p in progress], [0, 1, 2])
        self.assertEqual(Submission.objects.count(), 0)
        self.assertEqual(SubmissionResult.objects.count(), 0)
        self.assert_containers_removed(1)

    def test_test_run_preserves_wa_info_and_ce_without_formal_records(self):
        for code, expected, statuses in [
            (SUM, "wrong", ["AC", "WA"]),
            (SUM, "", ["AC", "info"]),
            ("invalid C++", "30", ["CE"]),
        ]:
            result = ProblemTestRunService.run(
                problem=self.problem, language="cpp", source_code=code,
                custom_test_cases=[{"input": "10 20\n", "expected_output": expected}],
            )
            self.assertEqual([r["status"] for r in result["results"]], statuses)
            self.assertEqual(result["status"], "AC" if statuses[-1] == "info" else statuses[-1])
        self.assertEqual(Submission.objects.count(), 0)
        self.assertEqual(SubmissionResult.objects.count(), 0)
        self.assert_containers_removed(3)
