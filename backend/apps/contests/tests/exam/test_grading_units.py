"""AI grading units keep teacher grades and survive partial submission; judgment stays with the agent."""
from uuid import uuid4
from unittest.mock import patch

from django.db import IntegrityError
from apps.contests.models import ExamAnswer, ExamBatchGradeWrite, ExamGradingUnit, ExamQuestionGroup
from .test_exam_answers import ExamAnswerTestBase


class GradingUnitTests(ExamAnswerTestBase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.teacher)
        self.answer = ExamAnswer.objects.create(participant=self.participant, question=self.q_essay, answer={'text': 'reasoning'})
        self.body = {'session_id': str(uuid4()), 'run_id': str(uuid4()), 'unit_id': 'essay', 'question_ids': [str(self.q_essay.pk)]}
        self.base = f'/api/v1/contests/{self.contest.pk}/exam-answers/'

    def post(self, action, **extra):
        return self.client.post(self.base + action + '/', {**self.body, **extra}, format='json')

    def draft(self, **extra):
        grade = {'exam_answer_id': str(self.answer.pk), 'score': 12.5, 'feedback': 'Reasoning is partly correct.'}
        grade.update(extra)
        return self.post('grading-draft', grades=[grade], rubric={'criteria': ['reasoning']})

    def test_snapshot_is_stable_and_includes_whole_group_without_expanding_write_scope(self):
        group = ExamQuestionGroup.objects.create(contest=self.contest, shared_stem_markdown='Shared passage')
        for question in (self.q_essay, self.q_single):
            question.group = group
            question.save()
        protected = ExamAnswer.objects.create(participant=self.participant, question=self.q_single, answer={'selected': 'A'})
        first = self.post('grading-unit')
        self.assertEqual(first.status_code, 200)
        self.assertEqual(len(first.data['questions']), 2)
        self.assertEqual(first.data['total_count'], 1)
        self.assertFalse(next(a for a in first.data['answers'] if a['exam_answer_id'] == str(protected.pk))['writable'])
        self.answer.answer = {'text': 'changed'}
        self.answer.save()
        self.assertEqual(self.post('grading-unit').data['answers'], first.data['answers'])
        self.assertEqual(ExamGradingUnit.objects.count(), 1)

    def test_drafts_do_not_write_grades_and_submit_is_idempotent_after_teacher_revoke(self):
        self.post('grading-unit')
        self.assertEqual(self.draft().data['draft_count'], 1)
        self.answer.refresh_from_db()
        self.assertIsNone(self.answer.score)
        first = self.post('grading-submit')
        self.assertEqual(first.data['written'], 1)
        self.assertEqual(ExamBatchGradeWrite.objects.count(), 1)
        self.client.post(self.base + f'{self.answer.pk}/ungrade/', {}, format='json')
        self.assertEqual(self.post('grading-submit').data, first.data)
        self.answer.refresh_from_db()
        self.assertIsNone(self.answer.score)
        self.assertEqual(self.draft(score=13).status_code, 400)
        progress = self.client.get(self.base + 'grading-progress/', {'session_id': self.body['session_id']})
        self.assertEqual(progress.data['units'][0]['status'], 'completed')

    def test_missing_drafts_and_invalid_scores_cannot_submit(self):
        self.post('grading-unit')
        self.assertEqual(self.post('grading-submit').status_code, 400)
        for score in (True, -1, 21, 'NaN', 'Infinity', '1.234'):
            self.assertEqual(self.draft(score=score).status_code, 400, score)
        self.assertEqual(self.draft(exam_answer_id='99999999').status_code, 400)
        self.assertEqual(ExamGradingUnit.objects.get().drafts, {})

    def test_teacher_grade_is_preserved(self):
        self.post('grading-unit')
        self.draft()
        self.answer.score, self.answer.feedback = 19, 'Teacher'
        self.answer.save()
        result = self.post('grading-submit').data
        self.assertEqual(result['skipped'], 1)
        self.assertEqual(result['failed'], 0)
        self.answer.refresh_from_db()
        self.assertEqual(self.answer.feedback, 'Teacher')
        self.assertEqual(ExamBatchGradeWrite.objects.count(), 0)

    def test_published_and_student_access_are_rejected(self):
        self.post('grading-unit')
        self.draft()
        self.client.force_authenticate(user=self.student)
        self.assertEqual(self.post('grading-unit').status_code, 403)
        self.assertEqual(self.post('grading-draft').status_code, 403)
        self.assertEqual(self.client.get(self.base + 'grading-progress/', {'session_id': self.body['session_id']}).status_code, 403)
        self.client.force_authenticate(user=self.teacher)
        self.contest.results_published = True
        self.contest.save()
        self.assertEqual(self.post('grading-submit').status_code, 400)
        self.answer.refresh_from_db()
        self.assertIsNone(self.answer.score)

    def test_latest_attempt_is_readable(self):
        self.post('grading-unit')
        self.draft()
        self.body['run_id'] = str(uuid4())
        self.post('grading-unit')
        result = self.client.get(self.base + 'grading-unit/', {'session_id': self.body['session_id'], 'unit_id': 'essay'})
        self.assertEqual(result.data['run_id'], self.body['run_id'])
        self.assertEqual(result.data['draft_count'], 0)

    def test_receipt_failure_rolls_back_grade_and_keeps_draft(self):
        self.post('grading-unit')
        self.draft()
        with patch('apps.contests.views.exam_grading_unit.ExamBatchGradeWrite.objects.update_or_create', side_effect=IntegrityError('receipt unavailable')):
            self.assertEqual(self.post('grading-submit').data['failed'], 1)
        self.answer.refresh_from_db()
        self.assertIsNone(self.answer.score)
        unit = ExamGradingUnit.objects.get()
        self.assertEqual(len(unit.drafts), 1)
        self.assertEqual(unit.results[str(self.answer.pk)]['status'], 'error')
        self.assertEqual(self.post('grading-submit').data['written'], 1)

    def test_partial_failure_commits_other_answers_and_retry_only_finishes_missing_write(self):
        second = ExamAnswer.objects.create(participant=self.participant, question=self.q_single, answer={'selected': 'B'})
        self.body['question_ids'].append(str(self.q_single.pk))
        self.post('grading-unit')
        self.draft()
        self.post('grading-draft', grades=[{'exam_answer_id': str(second.pk), 'score': 4, 'feedback': 'Partial credit'}])
        original = ExamBatchGradeWrite.objects.update_or_create

        def fail_one(*args, **kwargs):
            if kwargs['answer'].pk == self.answer.pk:
                raise IntegrityError('one receipt failed')
            return original(*args, **kwargs)

        with patch('apps.contests.views.exam_grading_unit.ExamBatchGradeWrite.objects.update_or_create', side_effect=fail_one):
            result = self.post('grading-submit').data
        self.assertEqual((result['written'], result['failed']), (1, 1))
        self.answer.refresh_from_db()
        second.refresh_from_db()
        self.assertIsNone(self.answer.score)
        self.assertEqual(second.score, 4)
        first_receipt = ExamBatchGradeWrite.objects.get(answer=second).graded_at
        result = self.post('grading-submit').data
        self.assertEqual((result['written'], result['failed']), (2, 0))
        self.assertEqual(ExamBatchGradeWrite.objects.get(answer=second).graded_at, first_receipt)

    def test_another_staff_cannot_adopt_a_session(self):
        self.post('grading-unit')
        self.student.is_staff = True
        self.student.role = 'admin'
        self.student.save()
        self.client.force_authenticate(user=self.student)
        self.assertEqual(self.post('grading-unit').status_code, 403)
        self.assertEqual(self.client.get(self.base + 'grading-unit/', {'session_id': self.body['session_id'], 'unit_id': 'essay'}).status_code, 403)

    def test_feedback_is_the_agents_call(self):
        self.post('grading-unit')
        self.assertEqual(self.draft(score=0, feedback='').status_code, 200)
        self.assertEqual(self.post('grading-submit').data['written'], 1)
        self.answer.refresh_from_db()
        self.assertEqual(self.answer.score, 0)
