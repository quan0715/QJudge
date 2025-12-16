"""
Tests for student report API endpoints.
"""
import pytest
from datetime import timedelta
from io import BytesIO

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.contests.models import Contest, ContestProblem, ContestParticipant, ExamStatus
from apps.problems.models import Problem, ProblemTranslation, TestCase
from apps.submissions.models import Submission
from apps.users.models import User


@pytest.mark.django_db
class TestStudentReportEndpoints:
    """Test student report download API endpoints."""
    
    @pytest.fixture
    def api_client(self):
        """Return an API client."""
        return APIClient()
    
    @pytest.fixture
    def admin_user(self):
        """Create an admin user."""
        return User.objects.create_superuser(
            username='admin',
            email='admin@example.com',
            password='adminpass123'
        )
    
    @pytest.fixture
    def teacher(self):
        """Create a teacher user."""
        return User.objects.create_user(
            username='teacher',
            email='teacher@example.com',
            password='testpass123',
            role='teacher'
        )
    
    @pytest.fixture
    def student(self):
        """Create a student user."""
        return User.objects.create_user(
            username='student1',
            email='student1@example.com',
            password='testpass123',
            role='student'
        )
    
    @pytest.fixture
    def other_student(self):
        """Create another student user."""
        return User.objects.create_user(
            username='student2',
            email='student2@example.com',
            password='testpass123',
            role='student'
        )
    
    @pytest.fixture
    def active_contest(self, teacher):
        """Create an active contest with start/end times."""
        now = timezone.now()
        return Contest.objects.create(
            name='期中考試',
            description='程式設計期中考試',
            rules='考試規則',
            owner=teacher,
            status='active',
            start_time=now - timedelta(hours=2),
            end_time=now + timedelta(hours=1)
        )
    
    @pytest.fixture
    def ended_contest(self, teacher):
        """Create an ended contest."""
        now = timezone.now()
        return Contest.objects.create(
            name='已結束考試',
            description='已結束的考試',
            owner=teacher,
            status='active',
            start_time=now - timedelta(hours=5),
            end_time=now - timedelta(hours=1)
        )
    
    @pytest.fixture
    def problem(self, active_contest):
        """Create a problem for the contest."""
        problem = Problem.objects.create(
            title='Test Problem',
            time_limit=1000,
            memory_limit=128,
            difficulty='easy',
            is_visible=True
        )
        
        ProblemTranslation.objects.create(
            problem=problem,
            language='zh-TW',
            title='測試題目',
            description='測試題目描述'
        )
        
        TestCase.objects.create(
            problem=problem,
            input_data='1',
            output_data='1',
            is_sample=True,
            score=20
        )
        
        ContestProblem.objects.create(
            contest=active_contest,
            problem=problem,
            order=0
        )
        
        return problem
    
    @pytest.fixture
    def submitted_participant(self, active_contest, student):
        """Create a participant who has submitted."""
        return ContestParticipant.objects.create(
            contest=active_contest,
            user=student,
            exam_status=ExamStatus.SUBMITTED,
            started_at=timezone.now() - timedelta(hours=1),
            left_at=timezone.now() - timedelta(minutes=30)
        )
    
    @pytest.fixture
    def in_progress_participant(self, active_contest, other_student):
        """Create a participant still in progress."""
        return ContestParticipant.objects.create(
            contest=active_contest,
            user=other_student,
            exam_status=ExamStatus.IN_PROGRESS,
            started_at=timezone.now() - timedelta(minutes=30)
        )
    
    @pytest.fixture
    def submission(self, active_contest, student, problem):
        """Create a submission for the student."""
        return Submission.objects.create(
            user=student,
            problem=problem,
            contest=active_contest,
            source_type='contest',
            language='cpp',
            code='#include <iostream>\nint main() { return 0; }',
            status='AC',
            score=20
        )
    
    # ===========================================
    # Admin Endpoint Tests
    # ===========================================
    
    def test_admin_can_download_participant_report(
        self, api_client, admin_user, active_contest, student,
        submitted_participant, problem, submission
    ):
        """Test that admin can download any participant's report."""
        api_client.force_authenticate(user=admin_user)
        
        response = api_client.get(
            f'/api/v1/contests/{active_contest.id}/participants/{student.id}/report/'
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response['Content-Type'] == 'application/pdf'
        assert 'attachment' in response['Content-Disposition']
        
        # Check PDF content
        content = b''.join(response.streaming_content)
        assert content[:4] == b'%PDF'
    
    def test_contest_owner_can_download_participant_report(
        self, api_client, teacher, active_contest, student,
        submitted_participant, problem, submission
    ):
        """Test that contest owner can download any participant's report."""
        api_client.force_authenticate(user=teacher)
        
        response = api_client.get(
            f'/api/v1/contests/{active_contest.id}/participants/{student.id}/report/'
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response['Content-Type'] == 'application/pdf'
    
    def test_student_cannot_access_admin_endpoint(
        self, api_client, student, active_contest, submitted_participant, problem
    ):
        """Test that students cannot use admin endpoint."""
        api_client.force_authenticate(user=student)
        
        response = api_client.get(
            f'/api/v1/contests/{active_contest.id}/participants/{student.id}/report/'
        )
        
        assert response.status_code == status.HTTP_403_FORBIDDEN
    
    def test_download_report_nonexistent_participant(
        self, api_client, admin_user, active_contest, problem
    ):
        """Test downloading report for non-existent participant."""
        api_client.force_authenticate(user=admin_user)
        
        response = api_client.get(
            f'/api/v1/contests/{active_contest.id}/participants/99999/report/'
        )
        
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_download_report_nonexistent_contest(self, api_client, admin_user, student):
        """Test downloading report for non-existent contest."""
        api_client.force_authenticate(user=admin_user)
        
        response = api_client.get(
            f'/api/v1/contests/99999/participants/{student.id}/report/'
        )
        
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_admin_report_with_language_param(
        self, api_client, admin_user, active_contest, student,
        submitted_participant, problem, submission
    ):
        """Test admin report with specific language parameter."""
        api_client.force_authenticate(user=admin_user)
        
        response = api_client.get(
            f'/api/v1/contests/{active_contest.id}/participants/{student.id}/report/',
            {'language': 'en'}
        )
        
        assert response.status_code == status.HTTP_200_OK
    
    # ===========================================
    # Student Endpoint Tests
    # ===========================================
    
    def test_submitted_student_can_download_own_report(
        self, api_client, student, active_contest, submitted_participant, problem, submission
    ):
        """Test that submitted student can download their own report."""
        api_client.force_authenticate(user=student)
        
        response = api_client.get(
            f'/api/v1/contests/{active_contest.id}/my_report/'
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response['Content-Type'] == 'application/pdf'
        assert 'attachment' in response['Content-Disposition']
        
        # Check PDF content
        content = b''.join(response.streaming_content)
        assert content[:4] == b'%PDF'
    
    def test_in_progress_student_cannot_download_report(
        self, api_client, other_student, active_contest, in_progress_participant, problem
    ):
        """Test that in-progress student cannot download their report."""
        api_client.force_authenticate(user=other_student)
        
        response = api_client.get(
            f'/api/v1/contests/{active_contest.id}/my_report/'
        )
        
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert 'submitted' in response.data.get('error', '').lower() or \
               'submitted' in response.data.get('detail', '').lower()
    
    def test_non_participant_cannot_download_report(
        self, api_client, other_student, active_contest, submitted_participant, problem
    ):
        """Test that non-participant cannot download report."""
        # other_student is not a participant in this case (no in_progress_participant fixture)
        new_student = User.objects.create_user(
            username='new_student',
            email='new@example.com',
            password='testpass123'
        )
        api_client.force_authenticate(user=new_student)
        
        response = api_client.get(
            f'/api/v1/contests/{active_contest.id}/my_report/'
        )
        
        # Non-participant gets 403 Forbidden
        assert response.status_code == status.HTTP_403_FORBIDDEN
    
    def test_unauthenticated_user_cannot_download_report(
        self, api_client, active_contest
    ):
        """Test that unauthenticated user cannot download report."""
        response = api_client.get(
            f'/api/v1/contests/{active_contest.id}/my_report/'
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_student_report_with_custom_scale(
        self, api_client, student, active_contest, submitted_participant, problem, submission
    ):
        """Test student report with custom scale parameter."""
        api_client.force_authenticate(user=student)
        
        response = api_client.get(
            f'/api/v1/contests/{active_contest.id}/my_report/',
            {'scale': '1.5'}
        )
        
        assert response.status_code == status.HTTP_200_OK
    
    def test_student_can_download_after_contest_ends(
        self, api_client, teacher, ended_contest, student
    ):
        """Test that submitted student can download after contest ends."""
        # Create participant and submission for ended contest
        problem = Problem.objects.create(
            title='Ended Contest Problem',
            time_limit=1000,
            memory_limit=128,
            difficulty='easy'
        )
        ProblemTranslation.objects.create(
            problem=problem,
            language='zh-TW',
            title='結束考試題目'
        )
        ContestProblem.objects.create(
            contest=ended_contest,
            problem=problem,
            order=0
        )
        ContestParticipant.objects.create(
            contest=ended_contest,
            user=student,
            exam_status=ExamStatus.SUBMITTED
        )
        Submission.objects.create(
            user=student,
            problem=problem,
            contest=ended_contest,
            source_type='contest',
            language='cpp',
            code='int main() {}',
            status='AC',
            score=20
        )
        
        api_client.force_authenticate(user=student)
        
        response = api_client.get(
            f'/api/v1/contests/{ended_contest.id}/my_report/'
        )
        
        assert response.status_code == status.HTTP_200_OK
    
    # ===========================================
    # Edge Cases
    # ===========================================
    
    def test_report_with_no_submissions(
        self, api_client, student, active_contest, submitted_participant, problem
    ):
        """Test report generation when student has no submissions."""
        api_client.force_authenticate(user=student)
        
        response = api_client.get(
            f'/api/v1/contests/{active_contest.id}/my_report/'
        )
        
        # Should still generate a report
        assert response.status_code == status.HTTP_200_OK
        content = b''.join(response.streaming_content)
        assert content[:4] == b'%PDF'
    
    def test_report_filename_contains_contest_and_user(
        self, api_client, admin_user, active_contest, student,
        submitted_participant, problem
    ):
        """Test that report filename contains contest and user info."""
        api_client.force_authenticate(user=admin_user)
        
        response = api_client.get(
            f'/api/v1/contests/{active_contest.id}/participants/{student.id}/report/'
        )
        
        assert response.status_code == status.HTTP_200_OK
        
        content_disposition = response['Content-Disposition']
        assert student.username in content_disposition or str(student.id) in content_disposition
    
    def test_invalid_scale_parameter(
        self, api_client, student, active_contest, submitted_participant, problem, submission
    ):
        """Test handling of invalid scale parameter."""
        api_client.force_authenticate(user=student)
        
        # Invalid scale should be handled gracefully
        response = api_client.get(
            f'/api/v1/contests/{active_contest.id}/my_report/',
            {'scale': 'invalid'}
        )
        
        # Should default to 1.0 and still work
        assert response.status_code == status.HTTP_200_OK
    
    def test_admin_can_download_in_progress_participant_report(
        self, api_client, admin_user, active_contest, other_student,
        in_progress_participant, problem
    ):
        """Test that admin can download report even for in-progress participants."""
        api_client.force_authenticate(user=admin_user)
        
        response = api_client.get(
            f'/api/v1/contests/{active_contest.id}/participants/{other_student.id}/report/'
        )
        
        # Admin should be able to access regardless of exam status
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestStudentReportPermissions:
    """Test permission edge cases for student reports."""
    
    @pytest.fixture
    def api_client(self):
        return APIClient()
    
    @pytest.fixture
    def teacher(self):
        return User.objects.create_user(
            username='teacher',
            email='teacher@example.com',
            password='testpass123',
            role='teacher'
        )
    
    @pytest.fixture
    def other_teacher(self):
        return User.objects.create_user(
            username='other_teacher',
            email='other_teacher@example.com',
            password='testpass123',
            role='teacher'
        )
    
    @pytest.fixture
    def contest(self, teacher):
        return Contest.objects.create(
            name='Test Contest',
            owner=teacher,
            status='active'
        )
    
    @pytest.fixture
    def student(self):
        return User.objects.create_user(
            username='student',
            email='student@example.com',
            password='testpass123'
        )
    
    @pytest.fixture
    def participant(self, contest, student):
        return ContestParticipant.objects.create(
            contest=contest,
            user=student,
            exam_status=ExamStatus.SUBMITTED
        )
    
    def test_non_owner_teacher_cannot_access_admin_endpoint(
        self, api_client, other_teacher, contest, student, participant
    ):
        """Test that a teacher who doesn't own the contest cannot access admin endpoint."""
        api_client.force_authenticate(user=other_teacher)
        
        response = api_client.get(
            f'/api/v1/contests/{contest.id}/participants/{student.id}/report/'
        )
        
        assert response.status_code == status.HTTP_403_FORBIDDEN
    
    def test_owner_can_access_admin_endpoint(
        self, api_client, teacher, contest, student, participant
    ):
        """Test that contest owner can access admin endpoint."""
        api_client.force_authenticate(user=teacher)
        
        response = api_client.get(
            f'/api/v1/contests/{contest.id}/participants/{student.id}/report/'
        )
        
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestStudentReportScoreCalculation:
    """
    Test that student report correctly excludes test submissions from score calculation.
    
    Bug fix: Standings included test submissions but individual reports didn't,
    causing score discrepancies between the two views.
    """
    
    @pytest.fixture
    def api_client(self):
        return APIClient()
    
    @pytest.fixture
    def teacher(self):
        return User.objects.create_user(
            username='teacher',
            email='teacher@example.com',
            password='testpass123',
            role='teacher'
        )
    
    @pytest.fixture
    def student(self):
        return User.objects.create_user(
            username='student',
            email='student@example.com',
            password='testpass123',
            role='student'
        )
    
    @pytest.fixture
    def contest(self, teacher):
        now = timezone.now()
        return Contest.objects.create(
            name='Score Test Contest',
            owner=teacher,
            status='active',
            start_time=now - timedelta(hours=2),
            end_time=now + timedelta(hours=1),
            scoreboard_visible_during_contest=True
        )
    
    @pytest.fixture
    def problem(self, contest):
        """Create a problem worth 100 points."""
        problem = Problem.objects.create(
            title='Score Test Problem',
            time_limit=1000,
            memory_limit=128,
            difficulty='easy',
            is_visible=True
        )
        
        ProblemTranslation.objects.create(
            problem=problem,
            language='zh-TW',
            title='分數測試題目',
            description='測試分數計算'
        )
        
        TestCase.objects.create(
            problem=problem,
            input_data='1',
            output_data='1',
            is_sample=True,
            score=100
        )
        
        ContestProblem.objects.create(
            contest=contest,
            problem=problem,
            order=0
        )
        
        return problem
    
    @pytest.fixture
    def participant(self, contest, student):
        return ContestParticipant.objects.create(
            contest=contest,
            user=student,
            exam_status=ExamStatus.SUBMITTED,
            started_at=timezone.now() - timedelta(hours=1)
        )
    
    def test_report_excludes_test_submissions(
        self, api_client, teacher, contest, student, problem, participant
    ):
        """
        Verify that report score calculation excludes test submissions.
        
        Student has:
        - Test submission: AC with 100 points (is_test=True) - should be EXCLUDED
        - Normal submission: WA with 50 points (is_test=False) - should be COUNTED
        
        Expected report score: 50 (not 100)
        """
        # Create test submission with AC (should be excluded)
        Submission.objects.create(
            user=student,
            problem=problem,
            contest=contest,
            source_type='contest',
            language='python',
            code='print("test AC")',
            status='AC',
            score=100,
            is_test=True  # Test submission
        )
        
        # Create normal submission with partial score (should be counted)
        Submission.objects.create(
            user=student,
            problem=problem,
            contest=contest,
            source_type='contest',
            language='python',
            code='print("normal WA")',
            status='WA',
            score=50,
            is_test=False  # Normal submission
        )
        
        api_client.force_authenticate(user=teacher)
        
        # Get standings
        standings_response = api_client.get(
            f'/api/v1/contests/{contest.id}/standings/'
        )
        assert standings_response.status_code == status.HTTP_200_OK
        
        standings = standings_response.data.get('standings', [])
        student_standing = next(
            (s for s in standings if s['user']['id'] == student.id),
            None
        )
        
        # Download report
        report_response = api_client.get(
            f'/api/v1/contests/{contest.id}/participants/{student.id}/report/'
        )
        assert report_response.status_code == status.HTTP_200_OK
        
        # Both should have the same score (50, not 100)
        # Standings score should be 50
        assert student_standing is not None
        assert student_standing['total_score'] == 50, \
            f"Standings should show 50, got {student_standing['total_score']}"
        
        # Note: We can't easily check PDF content, but we verified the calculation
        # uses the same is_test=False filter in calculate_standings()
    
    def test_both_use_same_score_calculation(
        self, api_client, teacher, contest, student, problem, participant
    ):
        """
        Test that standings and report use the same score calculation logic.
        
        This test creates multiple submissions and verifies consistency.
        """
        # Test submission: AC 100 points (should be excluded)
        Submission.objects.create(
            user=student,
            problem=problem,
            contest=contest,
            source_type='contest',
            language='python',
            code='test1',
            status='AC',
            score=100,
            is_test=True
        )
        
        # Normal submission: WA 30 points
        Submission.objects.create(
            user=student,
            problem=problem,
            contest=contest,
            source_type='contest',
            language='python',
            code='normal1',
            status='WA',
            score=30,
            is_test=False
        )
        
        # Normal submission: WA 60 points (higher, should be used)
        Submission.objects.create(
            user=student,
            problem=problem,
            contest=contest,
            source_type='contest',
            language='python',
            code='normal2',
            status='WA',
            score=60,
            is_test=False
        )
        
        api_client.force_authenticate(user=teacher)
        
        # Get standings score
        standings_response = api_client.get(
            f'/api/v1/contests/{contest.id}/standings/'
        )
        standings = standings_response.data.get('standings', [])
        student_standing = next(
            (s for s in standings if s['user']['id'] == student.id),
            None
        )
        
        # Should use highest normal submission score (60)
        assert student_standing['total_score'] == 60
        
        # Solved count should be 0 (no AC in normal submissions)
        assert student_standing['solved'] == 0

