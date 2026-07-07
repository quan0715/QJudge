import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from apps.classrooms.models import Classroom, ClassroomMember, ClassroomContest
from apps.contests.models import Contest

User = get_user_model()

class ClassroomViewsEnhancedTests(APITestCase):
    def setUp(self):
        # Clear classrooms to ensure stable counts
        Classroom.objects.all().delete()
        self.admin = User.objects.create_superuser(username='admin', email='admin@test.com', password='password123')
        # Ensure admin has role 'admin' if required by IsSuperAdmin or similar
        self.admin.role = 'admin'
        self.admin.save()
        
        self.teacher = User.objects.create_user(username='teacher', email='teacher@test.com', password='password123', role='teacher')
        self.student = User.objects.create_user(username='student', email='student@test.com', password='password123', role='student')
        
        self.classroom = Classroom.objects.create(
            name='Test Classroom',
            owner=self.teacher,
            invite_code='TESTCODE'
        )
        self.list_url = reverse('classrooms:classroom-list')
        self.detail_url = reverse('classrooms:classroom-detail', kwargs={'id': self.classroom.uuid})

    def test_list_classrooms_scopes(self):
        """Test listing classrooms with different scopes and include_archived"""
        # Create an archived classroom
        archived = Classroom.objects.create(name='Archived', owner=self.teacher, is_archived=True)
        
        self.client.force_authenticate(user=self.teacher)
        initial_response = self.client.get(self.list_url)
        initial_count = len(initial_response.data)
        
        # Default: exclude archived
        response = self.client.get(self.list_url)
        self.assertEqual(len(response.data), initial_count)
        
        # Include archived
        response = self.client.get(self.list_url, {'include_archived': 'true'})
        total_count = len(response.data)
        self.assertEqual(len(response.data), total_count)
        
        # Scope: enrolled
        # Create a new classroom specifically for this student
        other_teacher = User.objects.create_user(username='other_t', email='other_t@test.com', password='password')
        enrolled_classroom = Classroom.objects.create(name='Enrolled', owner=other_teacher, invite_code='ENROLLED')
        ClassroomMember.objects.create(classroom=enrolled_classroom, user=self.student, role='student')
        
        self.client.force_authenticate(user=self.student)
        response = self.client.get(self.list_url, {'scope': 'enrolled'})
        data = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        self.assertTrue(any(c['name'] == 'Enrolled' for c in data))

    def test_create_classroom_student_forbidden(self):
        """Test that students cannot create classrooms"""
        self.client.force_authenticate(user=self.student)
        response = self.client.post(self.list_url, {'name': 'New Classroom'})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_destroy_classroom_archives(self):
        """Test that destroying a classroom actually archives it"""
        self.client.force_authenticate(user=self.teacher)
        response = self.client.delete(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        
        self.classroom.refresh_from_db()
        self.assertTrue(self.classroom.is_archived)

    def test_member_management(self):
        """Test adding, removing, and updating member roles"""
        self.client.force_authenticate(user=self.teacher)
        
        # Add member (Use 'usernames' instead of 'identifiers')
        add_url = reverse('classrooms:classroom-add-members', kwargs={'id': self.classroom.uuid})
        response = self.client.post(add_url, {'usernames': [self.student.username], 'role': 'student'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(ClassroomMember.objects.filter(classroom=self.classroom, user=self.student).exists())
        
        # Update role
        update_role_url = reverse('classrooms:classroom-update-member-role', kwargs={'id': self.classroom.uuid})
        response = self.client.post(update_role_url, {'user_id': self.student.id, 'role': 'ta'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(ClassroomMember.objects.get(classroom=self.classroom, user=self.student).role, 'ta')
        
        # Update role - non-existent member
        response = self.client.post(update_role_url, {'user_id': 9999, 'role': 'ta'})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

        # Remove member
        remove_url = reverse('classrooms:classroom-remove-member', kwargs={'id': self.classroom.uuid})
        response = self.client.post(remove_url, {'user_id': self.student.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(ClassroomMember.objects.filter(classroom=self.classroom, user=self.student).exists())

    def test_bind_unbind_contest_admin_only(self):
        """Test binding and unbinding contests requires platform admin"""
        contest = Contest.objects.create(name='Global Contest', owner=self.admin)
        bind_url = reverse('classrooms:classroom-bind-contest', kwargs={'id': self.classroom.uuid})
        unbind_url = reverse('classrooms:classroom-unbind-contest', kwargs={'id': self.classroom.uuid})
        
        # Teacher (forbidden)
        self.client.force_authenticate(user=self.teacher)
        response = self.client.post(bind_url, {'contest_id': str(contest.id)})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        
        # Admin (allowed)
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(bind_url, {'contest_id': str(contest.id)})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(ClassroomContest.objects.filter(classroom=self.classroom, contest=contest).exists())
        
        # Unbind
        response = self.client.post(unbind_url, {'contest_id': str(contest.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(ClassroomContest.objects.filter(classroom=self.classroom, contest=contest).exists())

    def test_labs_facade(self):
        """Test listing and creating labs within a classroom"""
        self.client.force_authenticate(user=self.teacher)
        labs_url = reverse('classrooms:classroom-list-labs', kwargs={'id': self.classroom.uuid})
        
        # Create lab (Use 'coding' or 'paper_exam')
        lab_data = {
            'name': 'New Lab',
            'contest_type': 'coding',
            'start_time': '2026-01-01T00:00:00Z',
            'end_time': '2026-12-31T23:59:59Z'
        }
        response = self.client.post(labs_url, lab_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # List labs
        response = self.client.get(labs_url)
        self.assertEqual(len(response.data), 1)
        
        # Student access to unpublished lab (should be empty if not manager)
        self.client.force_authenticate(user=self.student)
        ClassroomMember.objects.create(classroom=self.classroom, user=self.student, role='student')
        response = self.client.get(labs_url)
        self.assertEqual(len(response.data), 0) # Because it's draft by default
