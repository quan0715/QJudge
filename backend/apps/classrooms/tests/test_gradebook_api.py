from datetime import timedelta
from unittest.mock import patch
from urllib.parse import quote

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.classrooms.models import Classroom, ClassroomContest, ClassroomMember
from apps.contests.models import (
    Contest,
    ContestParticipant,
    ExamAnswer,
    ExamQuestion,
    ExamQuestionScorePolicy,
    ExamQuestionType,
    ExamStatus,
)
from apps.contests.services.scoreboard import ScoreboardResult

User = get_user_model()


class ClassroomGradebookApiTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username='gb_owner', email='gb_owner@test.com', password='pw', role='teacher'
        )
        self.ta = User.objects.create_user(
            username='gb_ta', email='gb_ta@test.com', password='pw'
        )
        self.b_student = User.objects.create_user(
            username='b_student', email='b_student@test.com', password='pw'
        )
        self.a_student = User.objects.create_user(
            username='a_student', email='a_student@test.com', password='pw'
        )

        self.classroom = Classroom.objects.create(
            name='Gradebook / 2026', owner=self.owner, invite_code='GRADEBK1'
        )
        ClassroomMember.objects.create(classroom=self.classroom, user=self.ta, role='ta')
        ClassroomMember.objects.create(
            classroom=self.classroom, user=self.b_student, role='student'
        )
        ClassroomMember.objects.create(
            classroom=self.classroom, user=self.a_student, role='student'
        )
        self.b_student.profile.display_name = '乙同學'
        self.b_student.profile.save(update_fields=['display_name'])

        now = timezone.now()
        self.paper = Contest.objects.create(
            name='Midterm',
            contest_type='paper_exam',
            start_time=now - timedelta(days=2),
            owner=self.owner,
        )
        self.coding = Contest.objects.create(
            name='Lab 1',
            contest_type='coding',
            start_time=now - timedelta(days=1),
            owner=self.owner,
        )
        self.draft = Contest.objects.create(
            name='Draft exam',
            contest_type='paper_exam',
            start_time=None,
            owner=self.owner,
        )
        # Bound in an order unrelated to the expected column order.
        for contest in (self.draft, self.coding, self.paper):
            ClassroomContest.objects.create(classroom=self.classroom, contest=contest)

        questions = []
        for order, (score, policy) in enumerate(
            [
                (60, ExamQuestionScorePolicy.NORMAL),
                (60, ExamQuestionScorePolicy.NORMAL),
                (30, ExamQuestionScorePolicy.EXCLUDED),
            ]
        ):
            questions.append(
                ExamQuestion.objects.create(
                    contest=self.paper,
                    question_type=ExamQuestionType.SHORT_ANSWER,
                    prompt=f'Q{order + 1}',
                    correct_answer='x',
                    score=score,
                    score_policy=policy,
                    order=order,
                )
            )
        participant = ContestParticipant.objects.create(
            contest=self.paper,
            user=self.b_student,
            exam_status=ExamStatus.SUBMITTED,
            started_at=now,
        )
        for question, score in zip(questions[:2], (50, 46)):
            ExamAnswer.objects.create(
                participant=participant,
                question=question,
                answer={'text': 'x'},
                score=score,
            )

        patcher = patch(
            'apps.classrooms.services.gradebook.ScoreboardService.calculate',
            return_value=ScoreboardResult(
                problems=[{'score': 100}, {'score': 200}],
                standings=[
                    {'user': {'id': self.a_student.id}, 'total_score': 210},
                    {'user': {'id': self.b_student.id}, 'total_score': 0},
                ],
            ),
        )
        self.calculate = patcher.start()
        self.addCleanup(patcher.stop)

        self.url = reverse('classrooms:classroom-gradebook', kwargs={'id': self.classroom.uuid})
        self.export_url = reverse(
            'classrooms:classroom-gradebook-export', kwargs={'id': self.classroom.uuid}
        )

    def test_owner_gets_gradebook(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        contests = response.data['contests']
        self.assertEqual(
            [c['id'] for c in contests],
            [str(self.paper.id), str(self.coding.id), str(self.draft.id)],
        )
        self.assertEqual([c['max_score'] for c in contests], [120.0, 300.0, 0.0])
        self.assertEqual(contests[1]['contest_type'], 'coding')
        self.assertIsInstance(contests[0]['start_time'], str)
        self.assertIsNone(contests[2]['start_time'])

        students = response.data['students']
        self.assertEqual([s['username'] for s in students], ['a_student', 'b_student'])
        a_row, b_row = students
        self.assertEqual(a_row['display_name'], '')
        self.assertEqual(b_row['display_name'], '乙同學')
        self.assertEqual(
            a_row['scores'],
            {str(self.paper.id): None, str(self.coding.id): 210.0, str(self.draft.id): None},
        )
        self.assertEqual(b_row['scores'][str(self.paper.id)], 96.0)
        self.assertEqual(b_row['scores'][str(self.coding.id)], 0.0)

    def test_ta_can_view_gradebook(self):
        self.client.force_authenticate(user=self.ta)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_200_OK)

    def test_student_cannot_view_gradebook(self):
        self.client.force_authenticate(user=self.a_student)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.get(self.export_url).status_code, status.HTTP_403_FORBIDDEN
        )

    def test_export_csv(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(self.export_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response['Content-Type'].startswith('text/csv'))
        self.assertIn('_gradebook.csv', response['Content-Disposition'])
        self.assertIn(
            'filename="classroom_Gradebook _ 2026_gradebook.csv"',
            response['Content-Disposition'],
        )
        text = response.content.decode('utf-8')
        self.assertTrue(text.startswith('﻿'))
        lines = text.lstrip('﻿').splitlines()
        self.assertEqual(
            lines[0],
            '帳號,姓名,Midterm（滿分 120.00）,Lab 1（滿分 300.00）,Draft exam（滿分 0.00）',
        )
        self.assertEqual(lines[1], 'a_student,,,210.00,')
        self.assertEqual(lines[2], 'b_student,乙同學,96.00,0.00,')

    def test_export_csv_keeps_non_ascii_classroom_name_in_filename(self):
        self.classroom.name = '程式設計（一）'
        self.classroom.save(update_fields=['name'])
        self.client.force_authenticate(user=self.owner)

        response = self.client.get(self.export_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response['Content-Disposition'],
            "attachment; filename*=utf-8''"
            + quote('classroom_程式設計（一）_gradebook.csv'),
        )
