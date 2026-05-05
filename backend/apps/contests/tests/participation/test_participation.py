import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.contests.models import Contest, ContestParticipant
from apps.classrooms.models import Classroom, ClassroomMember, ClassroomContest

User = get_user_model()


class ContestParticipationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='password123',
            role='student'
        )
        self.admin = User.objects.create_user(
            username='admin',
            email='admin@example.com',
            password='password123',
            role='admin',
            is_staff=True
        )
        
        # Create public contest
        self.public_contest = Contest.objects.create(
            name='Public Contest',
            start_time=timezone.now(),
            end_time=timezone.now() + timedelta(hours=2),
            owner=self.admin,
            visibility='public',
            status='published'
        )
        
        # Create private contest
        self.private_contest = Contest.objects.create(
            name='Private Contest',
            start_time=timezone.now(),
            end_time=timezone.now() + timedelta(hours=2),
            owner=self.admin,
            visibility='private',
            status='published'
        )
        self.private_contest.set_contest_password('secretpassword')
        self.private_contest.save()

        self.client.force_authenticate(user=self.user)

    def _bind_user_to_contest(self, contest, user=None):
        u = user or self.user
        room = Classroom.objects.create(
            name=f"C-{contest.id}",
            owner=self.admin,
            invite_code=uuid.uuid4().hex[:8].upper(),
        )
        ClassroomMember.objects.create(classroom=room, user=u, role="student")
        ClassroomContest.objects.create(classroom=room, contest=contest)

    def test_register_public_contest(self):
        self._bind_user_to_contest(self.public_contest)
        url = reverse('contests:contest-register', args=[self.public_contest.id])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(ContestParticipant.objects.filter(contest=self.public_contest, user=self.user).exists())

    def test_register_private_contest_success(self):
        self._bind_user_to_contest(self.private_contest)
        url = reverse('contests:contest-register', args=[self.private_contest.id])
        response = self.client.post(url, {'password': 'secretpassword'})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(ContestParticipant.objects.filter(contest=self.private_contest, user=self.user).exists())

    def test_register_private_contest_fail(self):
        self._bind_user_to_contest(self.private_contest)
        url = reverse('contests:contest-register', args=[self.private_contest.id])
        response = self.client.post(url, {'password': 'wrongpassword'})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(ContestParticipant.objects.filter(contest=self.private_contest, user=self.user).exists())

    def test_register_blocks_when_ended(self):
        ended_contest = Contest.objects.create(
            name='Ended Contest',
            start_time=timezone.now() - timedelta(hours=2),
            end_time=timezone.now() - timedelta(hours=1),
            owner=self.admin,
            visibility='public',
            status='published',
        )
        url = reverse('contests:contest-register', args=[ended_contest.id])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data.get('message'), 'Contest has ended')

    def test_register_blocks_when_already_registered(self):
        self._bind_user_to_contest(self.public_contest)
        ContestParticipant.objects.create(contest=self.public_contest, user=self.user)
        url = reverse('contests:contest-register', args=[self.public_contest.id])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data.get('success'))

    def test_register_classroom_bound_contest_requires_classroom_membership(self):
        isolated = Contest.objects.create(
            name="Isolated",
            start_time=timezone.now(),
            end_time=timezone.now() + timedelta(hours=2),
            owner=self.admin,
            visibility="public",
            status="published",
        )
        classroom = Classroom.objects.create(
            name="Bound Classroom",
            owner=self.admin,
            invite_code="BOUND123",
        )
        ClassroomContest.objects.create(classroom=classroom, contest=isolated)

        url = reverse('contests:contest-register', args=[isolated.id])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            response.data.get('message'),
            'Join the classroom before joining this contest',
        )

    def test_register_classroom_bound_contest_allows_classroom_member_only(self):
        classroom = Classroom.objects.create(
            name="Bound Classroom 2",
            owner=self.admin,
            invite_code="BOUND234",
        )
        contest_b = Contest.objects.create(
            name="Bound B",
            start_time=timezone.now(),
            end_time=timezone.now() + timedelta(hours=2),
            owner=self.admin,
            visibility="public",
            status="published",
        )
        ClassroomContest.objects.create(classroom=classroom, contest=contest_b)
        ClassroomMember.objects.create(classroom=classroom, user=self.user, role="student")

        url = reverse('contests:contest-register', args=[contest_b.id])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            ContestParticipant.objects.filter(contest=contest_b, user=self.user).exists()
        )

    def test_register_classroom_bound_contest_allows_manager_member(self):
        classroom = Classroom.objects.create(
            name="Bound Classroom 3",
            owner=self.admin,
            invite_code="BOUND345",
        )
        contest_c = Contest.objects.create(
            name="Bound C",
            start_time=timezone.now(),
            end_time=timezone.now() + timedelta(hours=2),
            owner=self.admin,
            visibility="public",
            status="published",
        )
        ClassroomContest.objects.create(classroom=classroom, contest=contest_c)
        ClassroomMember.objects.create(classroom=classroom, user=self.user, role="ta")

        url = reverse('contests:contest-register', args=[contest_c.id])
        response = self.client.post(url)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            ContestParticipant.objects.filter(contest=contest_c, user=self.user).exists()
        )

    def test_enter_blocks_draft_contest(self):
        draft_contest = Contest.objects.create(
            name='Draft Contest',
            start_time=timezone.now(),
            end_time=timezone.now() + timedelta(hours=1),
            owner=self.admin,
            visibility='public',
            status='draft',
        )
        self._bind_user_to_contest(draft_contest)
        url = reverse('contests:contest-enter', args=[draft_contest.id])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data.get('message'), 'Contest is not published')

    def test_enter_blocks_when_not_classroom_member(self):
        room = Classroom.objects.create(
            name="NoMember",
            owner=self.admin,
            invite_code="NOMEM01",
        )
        ClassroomContest.objects.create(classroom=room, contest=self.public_contest)
        url = reverse('contests:contest-enter', args=[self.public_contest.id])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            response.data.get('message'),
            'Join the classroom before joining this contest',
        )

    def test_enter_allows_multiple_joins(self):
        contest = Contest.objects.create(
            name='Multi Join Contest',
            start_time=timezone.now(),
            end_time=timezone.now() + timedelta(hours=2),
            owner=self.admin,
            visibility='public',
            status='published',
            allow_multiple_joins=True,
        )
        self._bind_user_to_contest(contest)
        participant = ContestParticipant.objects.create(
            contest=contest,
            user=self.user,
            left_at=timezone.now() - timedelta(minutes=5),
        )
        url = reverse('contests:contest-enter', args=[contest.id])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        participant.refresh_from_db()
        self.assertIsNone(participant.left_at)

    def test_enter_and_leave_contest(self):
        self._bind_user_to_contest(self.public_contest)
        ContestParticipant.objects.create(contest=self.public_contest, user=self.user)

        # Enter
        url_enter = reverse('contests:contest-enter', args=[self.public_contest.id])
        response = self.client.post(url_enter)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Leave
        url_leave = reverse('contests:contest-leave', args=[self.public_contest.id])
        response = self.client.post(url_leave)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Check left_at
        participant = ContestParticipant.objects.get(contest=self.public_contest, user=self.user)
        self.assertIsNotNone(participant.left_at)
        
        # Try to enter again
        response = self.client.post(url_enter)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
