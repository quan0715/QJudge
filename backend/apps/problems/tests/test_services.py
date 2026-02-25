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
            display_id="Q010",
            difficulty="medium",
            time_limit=1000,
            memory_limit=128,
            visibility="private",
            created_in_contest=self.contest,
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

    def test_generate_contest_problem_id_defaults_to_q001(self):
        Problem.objects.exclude(id=self.source_problem.id).delete()
        self.source_problem.delete()
        self.assertEqual(ProblemService.generate_contest_problem_id(), "Q001")

    def test_generate_contest_problem_id_increments_max_q_number(self):
        Problem.objects.create(
            title="P",
            slug="problem-p001",
            display_id="Q001",
            created_by=self.user,
        )
        Problem.objects.create(
            title="P2",
            slug="problem-q099",
            display_id="Q099",
            created_by=self.user,
        )
        next_id = ProblemService.generate_contest_problem_id()
        self.assertEqual(next_id, "Q100")

    def test_generate_practice_problem_id_defaults_to_p001(self):
        Problem.objects.exclude(id=self.source_problem.id).delete()
        self.source_problem.delete()
        self.assertEqual(ProblemService.generate_practice_problem_id(), "P001")

    def test_generate_practice_problem_id_increments_max_p_number(self):
        Problem.objects.create(
            title="Practice1",
            slug="practice-p001",
            display_id="P001",
            created_by=self.user,
        )
        Problem.objects.create(
            title="Practice20",
            slug="practice-p020",
            display_id="P020",
            created_by=self.user,
        )
        next_id = ProblemService.generate_practice_problem_id()
        self.assertEqual(next_id, "P021")

    def test_clone_problem_copies_related_models(self):
        new_problem = ProblemService.clone_problem(
            source_problem=self.source_problem,
            contest=self.contest,
            created_by=self.user,
        )

        self.assertNotEqual(new_problem.id, self.source_problem.id)
        self.assertEqual(new_problem.visibility, "private")
        self.assertEqual(new_problem.created_in_contest_id, self.contest.id)
        self.assertTrue(new_problem.title.endswith("(Copy)"))
        self.assertEqual(new_problem.translations.count(), self.source_problem.translations.count())
        self.assertEqual(new_problem.test_cases.count(), self.source_problem.test_cases.count())
        self.assertEqual(
            new_problem.language_configs.count(),
            self.source_problem.language_configs.count(),
        )
        self.assertEqual(new_problem.tags.count(), self.source_problem.tags.count())

    def test_clone_problem_to_practice_sets_visibility_and_origin(self):
        practice_problem = ProblemService.clone_problem_to_practice(
            source_problem=self.source_problem,
            source_contest=self.contest,
            created_by=self.user,
        )

        self.assertEqual(practice_problem.visibility, "public")
        self.assertEqual(practice_problem.origin_problem_id, self.source_problem.id)
        self.assertEqual(practice_problem.created_in_contest_id, self.contest.id)
        self.assertEqual(practice_problem.translations.count(), self.source_problem.translations.count())
        self.assertEqual(practice_problem.test_cases.count(), self.source_problem.test_cases.count())

    def test_create_contest_problem_uses_private_visibility_defaults(self):
        contest_problem = ProblemService.create_contest_problem(
            contest=self.contest,
            created_by=self.user,
            title="New Contest Problem",
        )

        self.assertEqual(contest_problem.visibility, "private")
        self.assertEqual(contest_problem.difficulty, "medium")
        self.assertEqual(contest_problem.created_in_contest_id, self.contest.id)
        self.assertEqual(contest_problem.created_by_id, self.user.id)
        self.assertEqual(contest_problem.title, "New Contest Problem")
        self.assertTrue(contest_problem.display_id.startswith("Q"))
