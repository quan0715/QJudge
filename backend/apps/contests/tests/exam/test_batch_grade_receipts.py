"""Batch receipts survive artifact/worker failures and never adopt manual grades."""
from unittest.mock import patch
from uuid import uuid4

from django.db import IntegrityError
from django.utils import timezone

from apps.contests.models import ExamAnswer, ExamBatchGradeWrite
from .test_exam_answers import ExamAnswerTestBase


class BatchGradeReceiptTests(ExamAnswerTestBase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.teacher)
        self.session_id, self.run_id = uuid4(), uuid4()
        self.answer = ExamAnswer.objects.create(
            participant=self.participant, question=self.q_essay, answer={'text': 'original'},
        )
        self.base = f'/api/v1/contests/{self.contest.id}/exam-answers/'

    def grade(self, **overrides):
        body = {
            'grades': [{'exam_answer_id': self.answer.id, 'score': 8, 'feedback': 'AI'}],
            'only_if_ungraded': True,
            'question_id': str(self.q_essay.id),
            'batch_session_id': str(self.session_id), 'batch_run_id': str(self.run_id),
        }
        body.update(overrides)
        return self.client.post(self.base + 'batch-grade/', body, format='json')

    def writes(self, session_id=None):
        return self.client.get(self.base + 'batch-writes/', {'session_id': str(session_id or self.session_id)})

    def test_write_is_recoverable_without_any_artifact_and_retry_does_not_duplicate(self):
        self.assertEqual(self.grade().status_code, 200)
        receipt = ExamBatchGradeWrite.objects.get(answer=self.answer)
        self.assertEqual(receipt.run_id, self.run_id)
        self.assertEqual(self.grade().data['results'][0]['status'], 'skipped')
        self.assertEqual(ExamBatchGradeWrite.objects.count(), 1)
        self.assertEqual(self.writes().data['writes'], [{
            'exam_answer_id': str(self.answer.id), 'question_id': str(self.q_essay.id),
            'score': 8.0, 'feedback': 'AI', 'current': True,
        }])
        self.answer.refresh_from_db()
        self.assertEqual(self.answer.answer, {'text': 'original'})
        self.assertEqual(self._roster_total(), 8)

    def test_receipt_failure_rolls_back_the_grade(self):
        with patch('apps.contests.views.exam_answer.ExamBatchGradeWrite.objects.update_or_create',
                   side_effect=IntegrityError('receipt failed')):
            with self.assertRaises(IntegrityError):
                self.grade()
        self.answer.refresh_from_db()
        self.assertIsNone(self.answer.score)
        self.assertEqual(ExamBatchGradeWrite.objects.count(), 0)

    def test_existing_manual_grade_is_never_claimed_by_the_batch(self):
        self.answer.score = 8
        self.answer.feedback = 'AI'
        self.answer.save()
        self.assertEqual(self.grade().data['results'][0]['status'], 'skipped')
        self.assertEqual(self.writes().data['writes'], [])

    def test_manual_regrade_and_ungrade_invalidate_receipt(self):
        self.grade()
        self.client.post(self.base + f'{self.answer.id}/grade/', {'score': 8, 'feedback': 'AI'}, format='json')
        self.assertFalse(self.writes().data['writes'][0]['current'])
        self.client.post(self.base + f'{self.answer.id}/ungrade/', {}, format='json')
        self.assertFalse(self.writes().data['writes'][0]['current'])
        self.run_id = uuid4()
        self.grade()
        self.assertTrue(self.writes().data['writes'][0]['current'])
        self.assertEqual(ExamBatchGradeWrite.objects.get(answer=self.answer).run_id, self.run_id)

    def test_receipts_are_scoped_to_owner_session_and_contest(self):
        self.grade()
        self.assertEqual(self.writes(uuid4()).data['writes'], [])
        self.client.force_authenticate(user=self.student)
        self.assertEqual(self.writes().status_code, 403)
        from django.contrib.auth import get_user_model
        other = get_user_model().objects.create_user(username='other-admin', role='admin', is_staff=True)
        self.client.force_authenticate(user=other)
        self.assertEqual(self.writes().data['writes'], [])
        self.client.force_authenticate(user=self.teacher)
        other_contest = type(self.contest).objects.create(
            name='Other', owner=self.teacher, start_time=timezone.now(), end_time=timezone.now(),
        )
        response = self.client.get(f'/api/v1/contests/{other_contest.id}/exam-answers/batch-writes/',
                                   {'session_id': str(self.session_id)})
        self.assertEqual(response.data['writes'], [])

    def test_invalid_receipt_context_cannot_write_grades(self):
        self.assertEqual(self.grade(batch_session_id='invalid').status_code, 400)
        self.assertEqual(self.grade(only_if_ungraded=False).status_code, 400)
        self.answer.refresh_from_db()
        self.assertIsNone(self.answer.score)
