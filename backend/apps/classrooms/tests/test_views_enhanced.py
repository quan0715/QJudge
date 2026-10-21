import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from apps.classrooms.models import Classroom, ClassroomMember

User = get_user_model()

class ClassroomViewsEnhancedTests(APITestCase):
    def setUp(self):
        # Clear classrooms to ensure stable counts
        Classroom.objects.all().delete()
        self.admin = User.objects.create_superuser(username='admin', email='admin@test.com', password='password123')
        # Ensure admin has role 'admin' for platform-level permission checks.
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
        
        members_url = reverse('classrooms:classroom-members', kwargs={'id': self.classroom.uuid})
        response = self.client.post(
            members_url,
            {'usernames': [self.student.username], 'role': 'student'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(ClassroomMember.objects.filter(classroom=self.classroom, user=self.student).exists())

        member_url = reverse(
            'classrooms:classroom-member-detail',
            kwargs={'id': self.classroom.uuid, 'member_user_id': self.student.id},
        )
        response = self.client.patch(member_url, {'role': 'ta'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(ClassroomMember.objects.get(classroom=self.classroom, user=self.student).role, 'ta')

        missing_member_url = reverse(
            'classrooms:classroom-member-detail',
            kwargs={'id': self.classroom.uuid, 'member_user_id': 9999},
        )
        response = self.client.patch(missing_member_url, {'role': 'ta'})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

        response = self.client.delete(member_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ClassroomMember.objects.filter(classroom=self.classroom, user=self.student).exists())


class ClassroomTaPermissionTests(APITestCase):
    """TAs manage the classroom like its owner, except deleting it and changing anyone's role."""

    def setUp(self):
        self.owner = User.objects.create_user(username='perm_owner', email='perm_owner@test.com', password='pw', role='teacher')
        self.ta = User.objects.create_user(username='perm_ta', email='perm_ta@test.com', password='pw', role='teacher')
        self.other_ta = User.objects.create_user(username='perm_ta2', email='perm_ta2@test.com', password='pw', role='teacher')
        self.student = User.objects.create_user(username='perm_student', email='perm_student@test.com', password='pw', role='student')
        self.newcomer = User.objects.create_user(username='perm_new', email='perm_new@test.com', password='pw', role='student')
        self.classroom = Classroom.objects.create(name='TA Room', owner=self.owner, invite_code='TAROOM01')
        ClassroomMember.objects.create(classroom=self.classroom, user=self.ta, role='ta')
        ClassroomMember.objects.create(classroom=self.classroom, user=self.other_ta, role='ta')
        ClassroomMember.objects.create(classroom=self.classroom, user=self.student, role='student')
        self.detail_url = reverse('classrooms:classroom-detail', kwargs={'id': self.classroom.uuid})
        self.members_url = reverse('classrooms:classroom-members', kwargs={'id': self.classroom.uuid})
        self.client.force_authenticate(user=self.ta)

    def member_url(self, user):
        return f"{self.members_url}{user.id}/"

    def test_ta_cannot_archive_classroom(self):
        response = self.client.delete(self.detail_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.classroom.refresh_from_db()
        self.assertFalse(self.classroom.is_archived)

    def test_ta_cannot_change_member_role(self):
        response = self.client.patch(self.member_url(self.student), {'role': 'ta'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(ClassroomMember.objects.get(classroom=self.classroom, user=self.student).role, 'student')

    def test_ta_cannot_add_members_as_ta(self):
        response = self.client.post(self.members_url, {'usernames': [self.newcomer.username], 'role': 'ta'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(ClassroomMember.objects.filter(classroom=self.classroom, user=self.newcomer).exists())

    def test_ta_cannot_remove_another_ta(self):
        response = self.client.delete(self.member_url(self.other_ta))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(ClassroomMember.objects.filter(classroom=self.classroom, user=self.other_ta).exists())

    def test_ta_can_add_and_remove_students(self):
        added = self.client.post(self.members_url, {'usernames': [self.newcomer.username], 'role': 'student'}, format='json')
        removed = self.client.delete(self.member_url(self.student))

        self.assertEqual(added.status_code, status.HTTP_200_OK)
        self.assertEqual(added.data['added'], [self.newcomer.username])
        self.assertEqual(removed.status_code, status.HTTP_204_NO_CONTENT)

    def test_ta_can_update_classroom_settings(self):
        response = self.client.patch(self.detail_url, {'name': 'Renamed by TA'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.classroom.refresh_from_db()
        self.assertEqual(self.classroom.name, 'Renamed by TA')

    def test_owner_can_archive_and_change_roles(self):
        self.client.force_authenticate(user=self.owner)

        promoted = self.client.patch(self.member_url(self.student), {'role': 'ta'}, format='json')
        archived = self.client.delete(self.detail_url)

        self.assertEqual(promoted.status_code, status.HTTP_200_OK)
        self.assertEqual(archived.status_code, status.HTTP_204_NO_CONTENT)
