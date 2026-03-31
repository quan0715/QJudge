from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.contests.models import Contest
from apps.problems.models import LanguageConfig, Problem, ProblemTranslation, Tag, TestCase as ProblemTestCase
from apps.problems.services import ProblemService


User = get_user_model()


class ProblemServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="problem-owner",
            email="problem-owner@example.com",
            password="password123",
            role="teacher",
        )
        self.contest = Contest.objects.create(name="Contest A", owner=self.user)
        self.source_problem = Problem.objects.create(
            title="Two Sum",
            slug="two-sum",
            difficulty="medium",
            time_limit=1000,
            memory_limit=128,
            created_by=self.user,
        )
        ProblemTranslation.objects.create(
            problem=self.source_problem,
            language="zh-TW",
            title="兩數之和",
            description="desc",
            input_description="input",
            output_description="output",
            hint="hint",
        )
        ProblemTranslation.objects.create(
            problem=self.source_problem,
            language="en",
            title="Two Sum",
            description="desc-en",
            input_description="input-en",
            output_description="output-en",
            hint="hint-en",
        )
        ProblemTestCase.objects.create(
            problem=self.source_problem,
            input_data="1 2\n",
            output_data="3\n",
            is_sample=True,
            score=10,
            order=0,
        )
        ProblemTestCase.objects.create(
            problem=self.source_problem,
            input_data="2 4\n",
            output_data="6\n",
            is_sample=False,
            is_hidden=True,
            score=90,
            order=1,
        )
        LanguageConfig.objects.create(
            problem=self.source_problem,
            language="cpp",
            template_code="int main(){}",
            is_enabled=True,
            order=0,
        )
        tag = Tag.objects.create(name="array", slug="array")
        self.source_problem.tags.add(tag)

        # Ensure the source problem has a QuestionAsset (required by Phase 1 invariant)
        from apps.question_bank.question_assets import write_coding_content_to_asset, sync_asset_to_problem
        asset, version = write_coding_content_to_asset(
            owner=self.user,
            title="Two Sum",
            prompt="desc",
            difficulty="medium",
            translations=[],
            actor=self.user,
        )
        sync_asset_to_problem(question_asset=asset, problem=self.source_problem)

    def test_clone_problem_copies_related_models(self):
        new_problem = ProblemService.clone_problem(
            source_problem=self.source_problem,
            contest=self.contest,
            created_by=self.user,
        )

        self.assertNotEqual(new_problem.id, self.source_problem.id)
        self.assertTrue(new_problem.title.endswith("(Copy)"))
        self.assertEqual(new_problem.translations.count(), self.source_problem.translations.count())
        self.assertEqual(new_problem.test_cases.count(), self.source_problem.test_cases.count())
        self.assertEqual(
            new_problem.language_configs.count(),
            self.source_problem.language_configs.count(),
        )
        self.assertEqual(new_problem.tags.count(), self.source_problem.tags.count())

    def test_clone_problem_to_practice_keeps_standalone_copy(self):
        practice_problem = ProblemService.clone_problem_to_practice(
            source_problem=self.source_problem,
            created_by=self.user,
        )

        self.assertEqual(practice_problem.translations.count(), self.source_problem.translations.count())
        self.assertEqual(practice_problem.test_cases.count(), self.source_problem.test_cases.count())

    def test_create_contest_problem_uses_default_problem_fields(self):
        contest_problem = ProblemService.create_contest_problem(
            contest=self.contest,
            created_by=self.user,
            title="New Contest Problem",
        )

        self.assertEqual(contest_problem.difficulty, "medium")
        self.assertEqual(contest_problem.created_by_id, self.user.id)
        self.assertEqual(contest_problem.title, "New Contest Problem")
