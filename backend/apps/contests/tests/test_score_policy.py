"""Tests for the score_policy feature (excluded / full_marks questions)."""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.contests.models import (
    Contest,
    ContestParticipant,
    ExamAnswer,
    ExamQuestion,
    ExamQuestionScorePolicy,
    ExamQuestionType,
    ExamStatus,
)
from apps.contests.services.score_recalculation import (
    recalculate_all_scores,
    recalculate_participant_score,
)
from apps.contests.services.exam_scoring import ExamScoringService


User = get_user_model()


class ScoreRecalculationServiceTests(TestCase):
    """Unit tests for score_recalculation service."""

    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner-score",
            email="owner-score@example.com",
            password="password",
            role="teacher",
        )
        self.contest = Contest.objects.create(
            name="Score Policy Test",
            start_time=timezone.now() - timedelta(hours=1),
            end_time=timezone.now() + timedelta(hours=1),
            owner=self.owner,
            visibility="public",
            status="published",
            contest_type="paper_exam",
        )

        # Create 4 questions, each 10 points
        self.questions = []
        for i in range(4):
            q = ExamQuestion.objects.create(
                contest=self.contest,
                question_type=ExamQuestionType.SINGLE_CHOICE,
                prompt=f"Question {i + 1}",
                options=["A", "B", "C", "D"],
                correct_answer="A",
                score=10,
                order=i,
            )
            self.questions.append(q)

        # Create 2 students
        self.student1 = User.objects.create_user(
            username="student1-score", email="s1@example.com", password="password"
        )
        self.student2 = User.objects.create_user(
            username="student2-score", email="s2@example.com", password="password"
        )
        self.p1 = ContestParticipant.objects.create(
            contest=self.contest,
            user=self.student1,
            exam_status=ExamStatus.SUBMITTED,
        )
        self.p2 = ContestParticipant.objects.create(
            contest=self.contest,
            user=self.student2,
            exam_status=ExamStatus.SUBMITTED,
        )

        # Student 1: answers all 4 questions, gets Q1 correct, Q2-4 wrong
        for i, q in enumerate(self.questions):
            ExamAnswer.objects.create(
                participant=self.p1,
                question=q,
                answer={"selected": "A" if i == 0 else "B"},
                score=10 if i == 0 else 0,
                is_correct=(i == 0),
            )

        # Student 2: answers Q1-Q3, gets Q1-Q2 correct
        for i, q in enumerate(self.questions[:3]):
            ExamAnswer.objects.create(
                participant=self.p2,
                question=q,
                answer={"selected": "A" if i < 2 else "C"},
                score=10 if i < 2 else 0,
                is_correct=(i < 2),
            )

    def test_normal_policy_sums_all_scores(self):
        """Normal policy: simple sum of all answered questions."""
        score = recalculate_participant_score(self.p1)
        self.assertEqual(score, 10)

        score = recalculate_participant_score(self.p2)
        self.assertEqual(score, 20)

    def test_excluded_removes_question_from_total(self):
        """Excluded question should not contribute to total."""
        # Exclude Q1 (the one student1 got right)
        self.questions[0].score_policy = ExamQuestionScorePolicy.EXCLUDED
        self.questions[0].save()

        score = recalculate_participant_score(self.p1)
        self.assertEqual(score, 0)  # Only had Q1 right, now excluded

        score = recalculate_participant_score(self.p2)
        self.assertEqual(score, 10)  # Q2 still counts

    def test_full_marks_gives_max_to_everyone(self):
        """Full marks: question.score added to total regardless of answer."""
        # Q2 is full_marks (10 pts)
        self.questions[1].score_policy = ExamQuestionScorePolicy.FULL_MARKS
        self.questions[1].save()

        score = recalculate_participant_score(self.p1)
        # Q1: 10 (normal, correct), Q2: 10 (full_marks), Q3: 0, Q4: 0
        self.assertEqual(score, 20)

        score = recalculate_participant_score(self.p2)
        # Q1: 10, Q2: 10 (full_marks), Q3: 0
        self.assertEqual(score, 20)

    def test_full_marks_for_student_without_answer(self):
        """Full marks should count even when student has no ExamAnswer."""
        # Q4 is full_marks — student2 has no answer for Q4
        self.questions[3].score_policy = ExamQuestionScorePolicy.FULL_MARKS
        self.questions[3].save()

        score = recalculate_participant_score(self.p2)
        # Q1: 10, Q2: 10, Q3: 0, Q4: 10 (full_marks, no answer needed)
        self.assertEqual(score, 30)

    def test_excluded_and_full_marks_combined(self):
        """Mix of excluded and full_marks questions."""
        self.questions[0].score_policy = ExamQuestionScorePolicy.EXCLUDED
        self.questions[0].save()
        self.questions[1].score_policy = ExamQuestionScorePolicy.FULL_MARKS
        self.questions[1].save()

        score = recalculate_participant_score(self.p1)
        # Q1: excluded, Q2: 10 (full_marks), Q3: 0, Q4: 0
        self.assertEqual(score, 10)

    def test_all_excluded_gives_zero(self):
        """If all questions are excluded, total should be 0."""
        for q in self.questions:
            q.score_policy = ExamQuestionScorePolicy.EXCLUDED
            q.save()

        score = recalculate_participant_score(self.p1)
        self.assertEqual(score, 0)

    def test_recalculate_all_scores_updates_everyone(self):
        """recalculate_all_scores should update all participants."""
        self.questions[0].score_policy = ExamQuestionScorePolicy.FULL_MARKS
        self.questions[0].save()

        count = recalculate_all_scores(self.contest)
        self.assertEqual(count, 2)

        self.p1.refresh_from_db()
        self.p2.refresh_from_db()
        # Both get Q1 full marks (10) + their actual scores
        self.assertEqual(self.p1.score, 10)  # Q1:10(fm), Q2-4: 0
        self.assertEqual(self.p2.score, 20)  # Q1:10(fm), Q2:10, Q3:0

    def test_excluded_does_not_modify_answer_score(self):
        """Excluding a question should NOT change ExamAnswer.score values."""
        self.questions[0].score_policy = ExamQuestionScorePolicy.EXCLUDED
        self.questions[0].save()

        recalculate_participant_score(self.p1)

        answer = ExamAnswer.objects.get(participant=self.p1, question=self.questions[0])
        self.assertEqual(answer.score, 10)  # Original score preserved

    def test_ungraded_answers_not_counted(self):
        """Answers with score=None should not contribute to total."""
        # Ungrade Q1 for student1
        answer = ExamAnswer.objects.get(participant=self.p1, question=self.questions[0])
        answer.score = None
        answer.save()

        score = recalculate_participant_score(self.p1)
        self.assertEqual(score, 0)


class ExamScoringServiceTests(TestCase):
    """Tests for the consolidated ExamScoringService."""

    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner-svc",
            email="owner-svc@example.com",
            password="password",
            role="teacher",
        )
        self.contest = Contest.objects.create(
            name="Scoring Service Test",
            start_time=timezone.now() - timedelta(hours=1),
            end_time=timezone.now() + timedelta(hours=1),
            owner=self.owner,
            visibility="public",
            status="published",
            contest_type="paper_exam",
        )

        self.questions = []
        for i in range(4):
            q = ExamQuestion.objects.create(
                contest=self.contest,
                question_type=ExamQuestionType.SINGLE_CHOICE,
                prompt=f"Q{i + 1}",
                options=["A", "B", "C", "D"],
                correct_answer="A",
                score=10,
                order=i,
            )
            self.questions.append(q)

        self.student = User.objects.create_user(
            username="student-svc", email="ssvc@example.com", password="password"
        )
        self.participant = ContestParticipant.objects.create(
            contest=self.contest,
            user=self.student,
            exam_status=ExamStatus.SUBMITTED,
        )
        # Student scores: Q1=10, Q2=5, Q3=0, Q4=8
        scores = [10, 5, 0, 8]
        for i, q in enumerate(self.questions):
            ExamAnswer.objects.create(
                participant=self.participant,
                question=q,
                answer={"selected": "A"},
                score=scores[i],
                is_correct=(scores[i] == q.score),
            )

    def _service(self):
        return ExamScoringService(self.contest)

    def test_get_max_total_score_all_normal(self):
        svc = self._service()
        self.assertEqual(svc.get_max_total_score(), 40.0)

    def test_get_max_total_score_with_excluded(self):
        self.questions[0].score_policy = ExamQuestionScorePolicy.EXCLUDED
        self.questions[0].save()
        svc = self._service()
        self.assertEqual(svc.get_max_total_score(), 30.0)

    def test_get_max_total_score_with_full_marks(self):
        self.questions[1].score_policy = ExamQuestionScorePolicy.FULL_MARKS
        self.questions[1].save()
        svc = self._service()
        # full_marks still counts toward max
        self.assertEqual(svc.get_max_total_score(), 40.0)

    def test_calculate_participant_score_normal(self):
        svc = self._service()
        score = svc.calculate_participant_score(self.participant)
        self.assertEqual(score, 23.0)  # 10+5+0+8

    def test_calculate_participant_score_with_excluded(self):
        self.questions[0].score_policy = ExamQuestionScorePolicy.EXCLUDED
        self.questions[0].save()
        svc = self._service()
        score = svc.calculate_participant_score(self.participant)
        self.assertEqual(score, 13.0)  # 5+0+8

    def test_calculate_participant_score_with_full_marks(self):
        self.questions[2].score_policy = ExamQuestionScorePolicy.FULL_MARKS
        self.questions[2].save()
        svc = self._service()
        score = svc.calculate_participant_score(self.participant)
        self.assertEqual(score, 33.0)  # 10+5+10(fm)+8

    def test_recalculate_all(self):
        self.questions[0].score_policy = ExamQuestionScorePolicy.EXCLUDED
        self.questions[0].save()
        svc = self._service()
        count = svc.recalculate_all()
        self.assertEqual(count, 1)
        self.participant.refresh_from_db()
        self.assertEqual(self.participant.score, 13)

    def test_get_participant_breakdown(self):
        self.questions[1].score_policy = ExamQuestionScorePolicy.FULL_MARKS
        self.questions[1].save()
        svc = self._service()
        breakdown = svc.get_participant_breakdown(self.participant)
        self.assertEqual(breakdown.total_score, 28.0)  # 10 + 10(fm) + 0 + 8
        self.assertEqual(breakdown.max_total_score, 40.0)
        self.assertEqual(len(breakdown.items), 4)
        # full_marks item should show max score
        fm_item = breakdown.items[1]
        self.assertEqual(fm_item['score'], 10.0)
        self.assertEqual(fm_item['policy'], ExamQuestionScorePolicy.FULL_MARKS)

    def test_compute_participant_scores(self):
        self.questions[0].score_policy = ExamQuestionScorePolicy.EXCLUDED
        self.questions[0].save()
        svc = self._service()
        answers = list(
            ExamAnswer.objects.filter(participant=self.participant)
            .values('participant_id', 'question_id', 'score')
        )
        scores_map = svc.compute_participant_scores([self.participant.id], answers)
        self.assertAlmostEqual(scores_map[self.participant.id], 13.0)

    def test_get_score_distribution(self):
        svc = self._service()
        dist = svc.get_score_distribution([10.0, 20.0, 30.0])
        self.assertEqual(dist.average_score, 20.0)
        self.assertEqual(dist.median_score, 20)
        self.assertEqual(len(dist.buckets), 10)

    def test_get_question_stats(self):
        svc = self._service()
        answers = list(
            ExamAnswer.objects.filter(participant=self.participant)
            .values('question_id', 'score', 'is_correct', 'graded_at')
        )
        stats = svc.get_question_stats(answers)
        q1_stats = stats[str(self.questions[0].id)]
        self.assertEqual(q1_stats.answer_count, 1)
        self.assertEqual(q1_stats.graded_count, 1)
        self.assertEqual(q1_stats.score_sum, 10.0)
        self.assertEqual(q1_stats.full_count, 1)
