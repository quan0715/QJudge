"""Score policies (normal / excluded / full marks / redistribute) in ExamScoringService.

Every total is checked through all three read paths, the per-student breakdown,
the single-student totals and the bulk totals, so they cannot drift apart.
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.contests.models import (
    Contest,
    ContestParticipant,
    ExamAnswer,
    ExamQuestion,
    ExamQuestionScorePolicy as Policy,
    ExamQuestionType,
    ExamStatus,
)
from apps.contests.services.exam_scoring import ExamScoringService

User = get_user_model()


class ExamScoringPolicyTests(TestCase):
    """Five 10-point questions; the student scores 10, 5, 0, 10 and leaves Q5 unanswered."""

    def setUp(self):
        owner = User.objects.create_user(username="owner", email="owner@example.com", password="pw", role="teacher")
        self.contest = Contest.objects.create(
            name="Scoring", owner=owner, status="published", contest_type="paper_exam",
            start_time=timezone.now() - timedelta(hours=1), end_time=timezone.now() + timedelta(hours=1),
        )
        self.questions = [
            ExamQuestion.objects.create(
                contest=self.contest, question_type=ExamQuestionType.SINGLE_CHOICE,
                prompt=f"Q{i + 1}", options=["A", "B"], correct_answer=0, score=10, order=i,
            )
            for i in range(5)
        ]
        student = User.objects.create_user(username="student", email="student@example.com", password="pw")
        self.participant = ContestParticipant.objects.create(
            contest=self.contest, user=student, exam_status=ExamStatus.SUBMITTED,
        )
        for question, score in zip(self.questions, [10, 5, 0, 10]):
            ExamAnswer.objects.create(participant=self.participant, question=question, answer={"selected": 0}, score=score)

    def set_policy(self, index, policy, redistribute_to=None, score=None):
        question = self.questions[index]
        question.score_policy = policy
        if redistribute_to is not None:
            question.score_policy_config = {"redistribute_to": [str(self.questions[t].id) for t in redistribute_to]}
        if score is not None:
            question.score = score
        question.save()

    def assert_total(self, expected_total, expected_max):
        service = ExamScoringService(self.contest)
        answers = list(ExamAnswer.objects.filter(participant=self.participant).values("participant_id", "question_id", "score"))
        pid = self.participant.id
        self.assertEqual(service.get_participant_breakdown(self.participant).total_score, expected_total)
        self.assertEqual(service.get_participant_totals([pid])[pid], expected_total)
        self.assertEqual(service.compute_participant_scores([pid], answers)[pid], expected_total)
        self.assertEqual(service.get_max_total_score(), expected_max)

    def test_normal_policy_sums_graded_answers(self):
        self.assert_total(25, 50)

    def test_ungraded_answer_is_not_counted(self):
        ExamAnswer.objects.filter(question=self.questions[0]).update(score=None)
        self.assert_total(15, 50)

    def test_excluded_question_leaves_total_and_max(self):
        self.set_policy(0, Policy.EXCLUDED)
        self.assert_total(15, 40)
        # The stored grade is kept, so the teacher can undo the exclusion.
        self.assertEqual(ExamAnswer.objects.get(question=self.questions[0]).score, 10)

    def test_full_marks_count_for_everyone_answered_or_not(self):
        self.set_policy(2, Policy.FULL_MARKS)
        self.set_policy(4, Policy.FULL_MARKS)
        self.assert_total(45, 50)

    def test_redistribute_to_all_normal_questions(self):
        # Q1's 10 points spread over Q2–Q5 (12.5 each): 5→6.25, 0, 10→12.5, unanswered.
        self.set_policy(0, Policy.REDISTRIBUTE, redistribute_to=[])
        self.assert_total(18.75, 50)

    def test_redistribute_to_chosen_targets_skips_excluded_and_full_marks(self):
        # Q1 goes to Q2 and Q3 only (15 each); Q4 is full marks and Q5 excluded, so they get nothing.
        self.set_policy(3, Policy.FULL_MARKS)
        self.set_policy(4, Policy.EXCLUDED)
        self.set_policy(0, Policy.REDISTRIBUTE, redistribute_to=[1, 2, 3, 4])
        # Valid targets Q2, Q3: Q2 5→7.5, Q3 0; Q4 full marks 10.
        self.assert_total(17.5, 40)

    def test_redistributed_totals_round_to_two_decimals(self):
        # 1 point split 2:1 across Q2 (2 pts) and Q3 (1 pt); Q2 earns 1 of 2 → 1 × 2.6667/2.
        self.set_policy(1, Policy.NORMAL, score=2)
        self.set_policy(2, Policy.NORMAL, score=1)
        ExamAnswer.objects.filter(participant=self.participant).update(score=0)
        ExamAnswer.objects.filter(question=self.questions[1]).update(score=1)
        self.set_policy(0, Policy.REDISTRIBUTE, redistribute_to=[1, 2], score=1)
        self.set_policy(3, Policy.EXCLUDED)
        self.set_policy(4, Policy.EXCLUDED)
        self.assert_total(1.33, 4)
