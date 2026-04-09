from django.urls import reverse
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from uuid import uuid4
from apps.contests.models import (
    Contest, ContestParticipant, ExamQuestion, ExamAnswer,
    ExamStatus, ExamQuestionType,
)

User = get_user_model()


class ExamAnswerTestBase(APITestCase):
    """Shared setup for exam answer tests."""

    def setUp(self):
        cache.clear()
        self.student = User.objects.create_user(
            username='student', email='student@test.com', password='pass'
        )
        self.teacher = User.objects.create_user(
            username='teacher', email='teacher@test.com', password='pass',
            is_staff=True, role='admin'
        )
        self.contest = Contest.objects.create(
            name='Exam Test',
            start_time=timezone.now() - timedelta(minutes=10),
            end_time=timezone.now() + timedelta(hours=2),
            owner=self.teacher,
            visibility='public',
            status='published',
            cheat_detection_enabled=True,
        )
        self.participant = ContestParticipant.objects.create(
            contest=self.contest,
            user=self.student,
            exam_status=ExamStatus.IN_PROGRESS,
            started_at=timezone.now(),
        )
        # Create questions
        self.q_single = ExamQuestion.objects.create(
            contest=self.contest,
            question_type=ExamQuestionType.SINGLE_CHOICE,
            prompt='Pick one',
            options=['A', 'B', 'C'],
            correct_answer='B',
            score=5,
            order=1,
        )
        self.q_multi = ExamQuestion.objects.create(
            contest=self.contest,
            question_type=ExamQuestionType.MULTIPLE_CHOICE,
            prompt='Pick many',
            options=['X', 'Y', 'Z'],
            correct_answer=['X', 'Z'],
            score=10,
            order=2,
        )
        self.q_essay = ExamQuestion.objects.create(
            contest=self.contest,
            question_type=ExamQuestionType.ESSAY,
            prompt='Explain something',
            score=20,
            order=3,
        )


class ExamAnswerSubmitTests(ExamAnswerTestBase):
    """Tests for POST /exam-answers/submit/"""

    def _url(self):
        return reverse(
            'contests:contest-exam-answers-submit-answer',
            kwargs={'contest_pk': self.contest.id}
        )

    def test_submit_single_choice_correct(self):
        self.client.force_authenticate(user=self.student)
        resp = self.client.post(self._url(), {
            'question_id': self.q_single.id,
            'answer': {'selected': 'B'},
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        ans = ExamAnswer.objects.get(participant=self.participant, question=self.q_single)
        self.assertTrue(ans.is_correct)
        self.assertEqual(ans.score, 5)

    def test_submit_single_choice_wrong(self):
        self.client.force_authenticate(user=self.student)
        self.client.post(self._url(), {
            'question_id': self.q_single.id,
            'answer': {'selected': 'A'},
        }, format='json')
        ans = ExamAnswer.objects.get(participant=self.participant, question=self.q_single)
        self.assertFalse(ans.is_correct)
        self.assertEqual(ans.score, 0)

    def test_submit_multiple_choice_correct(self):
        self.client.force_authenticate(user=self.student)
        self.client.post(self._url(), {
            'question_id': self.q_multi.id,
            'answer': {'selected': ['X', 'Z']},
        }, format='json')
        ans = ExamAnswer.objects.get(participant=self.participant, question=self.q_multi)
        self.assertTrue(ans.is_correct)
        self.assertEqual(ans.score, 10)

    def test_submit_essay(self):
        self.client.force_authenticate(user=self.student)
        self.client.post(self._url(), {
            'question_id': self.q_essay.id,
            'answer': {'text': 'My essay answer'},
        }, format='json')
        ans = ExamAnswer.objects.get(participant=self.participant, question=self.q_essay)
        self.assertIsNone(ans.is_correct)
        self.assertIsNone(ans.score)

    def test_upsert_answer(self):
        """Submitting again updates the existing answer."""
        self.client.force_authenticate(user=self.student)
        self.client.post(self._url(), {
            'question_id': self.q_single.id,
            'answer': {'selected': 'A'},
        }, format='json')
        resp = self.client.post(self._url(), {
            'question_id': self.q_single.id,
            'answer': {'selected': 'B'},
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(ExamAnswer.objects.filter(
            participant=self.participant, question=self.q_single
        ).count(), 1)
        ans = ExamAnswer.objects.get(participant=self.participant, question=self.q_single)
        self.assertEqual(ans.answer['selected'], 'B')

    def test_submit_requires_in_progress(self):
        """Cannot submit when exam is not in progress."""
        self.participant.exam_status = ExamStatus.SUBMITTED
        self.participant.save()
        self.client.force_authenticate(user=self.student)
        resp = self.client.post(self._url(), {
            'question_id': self.q_single.id,
            'answer': {'selected': 'A'},
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_submit_nonexistent_question(self):
        self.client.force_authenticate(user=self.student)
        resp = self.client.post(self._url(), {
            'question_id': str(uuid4()),
            'answer': {'selected': 'A'},
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_submit_unauthenticated(self):
        resp = self.client.post(self._url(), {
            'question_id': self.q_single.id,
            'answer': {'selected': 'A'},
        }, format='json')
        self.assertIn(resp.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_student_non_empty_answer_locks_contest_question_edit(self):
        self.client.force_authenticate(user=self.student)
        resp = self.client.post(self._url(), {
            'question_id': self.q_essay.id,
            'answer': {'text': 'hello'},
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.contest.refresh_from_db()
        self.assertTrue(self.contest.question_edit_locked)
        self.assertEqual(
            self.contest.question_edit_lock_trigger,
            Contest.QuestionEditLockTrigger.EXAM_ANSWER,
        )
        self.assertIsNotNone(self.contest.question_edit_locked_at)

    def test_empty_answer_does_not_lock_contest_question_edit(self):
        self.client.force_authenticate(user=self.student)
        resp = self.client.post(self._url(), {
            'question_id': self.q_essay.id,
            'answer': {'text': ''},
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.contest.refresh_from_db()
        self.assertFalse(self.contest.question_edit_locked)


class ExamAnswerMyAnswersTests(ExamAnswerTestBase):
    """Tests for GET /exam-answers/my-answers/"""

    def _url(self):
        return reverse(
            'contests:contest-exam-answers-my-answers',
            kwargs={'contest_pk': self.contest.id}
        )

    def test_get_my_answers(self):
        ExamAnswer.objects.create(
            participant=self.participant,
            question=self.q_single,
            answer={'selected': 'B'},
        )
        self.client.force_authenticate(user=self.student)
        resp = self.client.get(self._url())
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['question_id'], str(self.q_single.id))

    def test_empty_answers(self):
        self.client.force_authenticate(user=self.student)
        resp = self.client.get(self._url())
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 0)


class ExamAnswerResultsTests(ExamAnswerTestBase):
    """Tests for GET /exam-answers/results/"""

    def _url(self):
        return reverse(
            'contests:contest-exam-answers-results',
            kwargs={'contest_pk': self.contest.id}
        )

    def test_results_blocked_before_publish(self):
        self.client.force_authenticate(user=self.student)
        resp = self.client.get(self._url())
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_results_available_after_publish(self):
        self.contest.results_published = True
        self.contest.save()
        ExamAnswer.objects.create(
            participant=self.participant,
            question=self.q_single,
            answer={'selected': 'B'},
            is_correct=True,
            score=5,
        )
        self.client.force_authenticate(user=self.student)
        resp = self.client.get(self._url())
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(float(resp.data[0]['score']), 5.0)

    def test_teacher_can_view_before_publish(self):
        self.client.force_authenticate(user=self.teacher)
        # Teacher needs to be a participant to use the results endpoint
        ContestParticipant.objects.create(
            contest=self.contest, user=self.teacher,
            exam_status=ExamStatus.NOT_STARTED,
        )
        resp = self.client.get(self._url())
        self.assertEqual(resp.status_code, status.HTTP_200_OK)


class ExamAnswerGradeTests(ExamAnswerTestBase):
    """Tests for POST /exam-answers/{id}/grade/ and GET /exam-answers/all-answers/"""

    def test_teacher_grade_answer(self):
        ans = ExamAnswer.objects.create(
            participant=self.participant,
            question=self.q_essay,
            answer={'text': 'My essay'},
        )
        self.client.force_authenticate(user=self.teacher)
        url = reverse(
            'contests:contest-exam-answers-grade-answer',
            kwargs={'contest_pk': self.contest.id, 'pk': ans.id}
        )
        resp = self.client.post(url, {
            'score': 15,
            'feedback': 'Good answer',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ans.refresh_from_db()
        self.assertEqual(ans.score, 15)
        self.assertEqual(ans.feedback, 'Good answer')
        self.assertEqual(ans.graded_by, self.teacher)
        # Check participant total score updated
        self.participant.refresh_from_db()
        self.assertEqual(self.participant.score, 15)

    def test_teacher_grade_answer_rounds_participant_score(self):
        ans = ExamAnswer.objects.create(
            participant=self.participant,
            question=self.q_essay,
            answer={'text': 'My essay'},
        )
        self.client.force_authenticate(user=self.teacher)
        url = reverse(
            'contests:contest-exam-answers-grade-answer',
            kwargs={'contest_pk': self.contest.id, 'pk': ans.id}
        )
        resp = self.client.post(url, {
            'score': 1.6,
            'feedback': 'Partial credit',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.participant.refresh_from_db()
        self.assertEqual(self.participant.score, 2)

    def test_teacher_grade_after_exam_submitted(self):
        """考生已交卷仍可批改問答題（配合前端 E2E 交卷後批改流程）。"""
        self.participant.exam_status = ExamStatus.SUBMITTED
        self.participant.save(update_fields=["exam_status"])
        ans = ExamAnswer.objects.create(
            participant=self.participant,
            question=self.q_essay,
            answer={"text": "Submitted essay"},
        )
        self.client.force_authenticate(user=self.teacher)
        url = reverse(
            "contests:contest-exam-answers-grade-answer",
            kwargs={"contest_pk": self.contest.id, "pk": ans.id},
        )
        resp = self.client.post(
            url, {"score": 12, "feedback": "ok"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ans.refresh_from_db()
        self.assertEqual(ans.score, 12)
        self.participant.refresh_from_db()
        self.assertEqual(self.participant.score, 12)

    def test_student_cannot_grade(self):
        ans = ExamAnswer.objects.create(
            participant=self.participant,
            question=self.q_essay,
            answer={'text': 'My essay'},
        )
        self.client.force_authenticate(user=self.student)
        url = reverse(
            'contests:contest-exam-answers-grade-answer',
            kwargs={'contest_pk': self.contest.id, 'pk': ans.id}
        )
        resp = self.client.post(url, {'score': 15}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_teacher_view_all_answers(self):
        ExamAnswer.objects.create(
            participant=self.participant,
            question=self.q_single,
            answer={'selected': 'B'},
        )
        self.client.force_authenticate(user=self.teacher)
        url = reverse(
            'contests:contest-exam-answers-all-answers',
            kwargs={'contest_pk': self.contest.id}
        )
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)

    def test_student_cannot_view_all(self):
        self.client.force_authenticate(user=self.student)
        url = reverse(
            'contests:contest-exam-answers-all-answers',
            kwargs={'contest_pk': self.contest.id}
        )
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_teacher_view_dashboard_summary(self):
        second_student = User.objects.create_user(
            username='student2',
            email='student2@test.com',
            password='pass',
            role='student',
        )
        second_participant = ContestParticipant.objects.create(
            contest=self.contest,
            user=second_student,
            exam_status=ExamStatus.SUBMITTED,
            started_at=timezone.now(),
        )
        ExamAnswer.objects.create(
            participant=self.participant,
            question=self.q_single,
            answer={'selected': 'B'},
            is_correct=True,
            score=5,
        )
        ExamAnswer.objects.create(
            participant=self.participant,
            question=self.q_essay,
            answer={'text': 'draft'},
            score=None,
        )
        ExamAnswer.objects.create(
            participant=second_participant,
            question=self.q_single,
            answer={'selected': 'A'},
            is_correct=False,
            score=0,
        )
        ExamAnswer.objects.create(
            participant=second_participant,
            question=self.q_essay,
            answer={'text': 'graded'},
            score=18,
            graded_at=timezone.now(),
        )

        self.client.force_authenticate(user=self.teacher)
        url = reverse(
            'contests:contest-exam-answers-dashboard-summary',
            kwargs={'contest_pk': self.contest.id},
        )
        resp = self.client.get(url)

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['contest']['participant_count'], 2)
        self.assertEqual(resp.data['contest']['completed_count'], 1)
        self.assertEqual(resp.data['summary']['max_total_score'], 35)
        self.assertEqual(len(resp.data['questions']), 3)

        single_summary = next(item for item in resp.data['questions'] if item['question_id'] == str(self.q_single.id))
        essay_summary = next(item for item in resp.data['questions'] if item['question_id'] == str(self.q_essay.id))

        self.assertEqual(single_summary['objective_stats']['correct_rate'], 50)
        self.assertEqual(single_summary['answer_count'], 2)
        self.assertEqual(essay_summary['subjective_stats']['graded_count'], 1)
        self.assertEqual(essay_summary['subjective_stats']['pending_count'], 1)

    def test_dashboard_summary_cache_invalidates_on_submission(self):
        self.client.force_authenticate(user=self.teacher)
        summary_url = reverse(
            'contests:contest-exam-answers-dashboard-summary',
            kwargs={'contest_pk': self.contest.id},
        )

        first = self.client.get(summary_url)
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        initial_single = next(
            item for item in first.data['questions']
            if item['question_id'] == str(self.q_single.id)
        )
        self.assertEqual(initial_single['answer_count'], 0)

        self.client.force_authenticate(user=self.student)
        submit_url = reverse(
            'contests:contest-exam-answers-submit-answer',
            kwargs={'contest_pk': self.contest.id},
        )
        submit = self.client.post(
            submit_url,
            {
                'question_id': self.q_single.id,
                'answer': {'selected': 'B'},
            },
            format='json',
        )
        self.assertEqual(submit.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(user=self.teacher)
        second = self.client.get(summary_url)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        updated_single = next(
            item for item in second.data['questions']
            if item['question_id'] == str(self.q_single.id)
        )
        self.assertEqual(updated_single['answer_count'], 1)
        self.assertEqual(updated_single['objective_stats']['correct_rate'], 100)

    def test_teacher_view_question_detail(self):
        second_student = User.objects.create_user(
            username='student3',
            email='student3@test.com',
            password='pass',
            role='student',
        )
        second_participant = ContestParticipant.objects.create(
            contest=self.contest,
            user=second_student,
            exam_status=ExamStatus.SUBMITTED,
            started_at=timezone.now(),
        )
        ExamAnswer.objects.create(
            participant=self.participant,
            question=self.q_single,
            answer={'selected': 'B'},
            is_correct=True,
            score=5,
        )
        ExamAnswer.objects.create(
            participant=second_participant,
            question=self.q_single,
            answer={'selected': 'A'},
            is_correct=False,
            score=0,
        )

        self.client.force_authenticate(user=self.teacher)
        url = reverse(
            'contests:contest-exam-answers-question-detail',
            kwargs={'contest_pk': self.contest.id},
        )
        resp = self.client.get(url, {'question_id': str(self.q_single.id)})

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['kind'], ExamQuestionType.SINGLE_CHOICE)
        self.assertEqual(resp.data['omitted_count'], 0)
        option_b = next(item for item in resp.data['option_distribution'] if item['label'].startswith('B.'))
        self.assertEqual(option_b['count'], 1)
        self.assertTrue(option_b['is_correct'])

    def test_question_detail_cache_invalidates_on_grading(self):
        answer = ExamAnswer.objects.create(
            participant=self.participant,
            question=self.q_essay,
            answer={'text': 'draft'},
            score=None,
            graded_at=None,
        )

        self.client.force_authenticate(user=self.teacher)
        detail_url = reverse(
            'contests:contest-exam-answers-question-detail',
            kwargs={'contest_pk': self.contest.id},
        )
        first = self.client.get(detail_url, {'question_id': str(self.q_essay.id)})
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data['grading_progress']['graded'], 0)

        grade_url = reverse(
            'contests:contest-exam-answers-grade-answer',
            kwargs={'contest_pk': self.contest.id, 'pk': answer.id},
        )
        grade = self.client.post(
            grade_url,
            {'score': 18, 'feedback': 'ok'},
            format='json',
        )
        self.assertEqual(grade.status_code, status.HTTP_200_OK)

        second = self.client.get(detail_url, {'question_id': str(self.q_essay.id)})
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data['grading_progress']['graded'], 1)
