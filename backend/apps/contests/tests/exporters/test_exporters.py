"""
Tests for contest export functionality.
"""
import pytest
from io import BytesIO
from datetime import timedelta
from django.utils import timezone
from apps.contests.models import Contest, ContestParticipant, ExamStatus
from apps.contests.tests import bind_problem_to_contest
from apps.contests.exporters import MarkdownRenderer, PDFRenderer, StudentReportRenderer
from apps.problems.models import CodingProblem, TestCase as ProblemTestCase
from apps.question_bank.models import QuestionAsset
from apps.submissions.models import Submission
from apps.users.models import User


def _create_problem_with_asset(slug, title, difficulty, translations, owner=None):
    """Helper: create Problem + QuestionAsset with content."""
    t = translations[0] if translations else {}
    asset = QuestionAsset.objects.create(
        owner=owner,
        asset_type=QuestionAsset.AssetType.CODING,
        title=title,
        payload={
            "difficulty": difficulty,
            "description": t.get("description", ""),
            "input_description": t.get("input_description", ""),
            "output_description": t.get("output_description", ""),
            "hint": t.get("hint", ""),
        },
    )
    problem = CodingProblem.objects.create(
        slug=slug,
        time_limit=1000,
        memory_limit=128,
        question_asset=asset,
        created_by=owner,
    )
    return problem


@pytest.mark.django_db
class TestContestExporters:
    """Test contest exporters."""
    
    @pytest.fixture
    def user(self):
        """Create a test user."""
        return User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
    
    @pytest.fixture
    def contest(self, user):
        """Create a test contest."""
        return Contest.objects.create(
            name='Test Contest',
            description='Test Description',
            rules='Test Rules',
            owner=user,
            status='published'
        )
    
    @pytest.fixture
    def problem(self, contest, user):
        """Create a test problem with translation and test cases."""
        problem = _create_problem_with_asset(
            slug='test-problem-main', title='測試題目', difficulty='medium',
            translations=[{
                'language': 'zh-TW', 'title': '測試題目',
                'description': '這是一個測試題目描述',
                'input_description': '輸入說明',
                'output_description': '輸出說明',
                'hint': '提示內容',
            }],
            owner=user,
        )

        # Add sample test case
        ProblemTestCase.objects.create(
            problem=problem,
            input_data='1 2',
            output_data='3',
            is_sample=True,
            score=10
        )

        # Add to contest
        bind_problem_to_contest(contest, problem, order=0)

        return problem
    
    def test_markdown_exporter(self, contest, problem):
        """Test markdown export."""
        exporter = MarkdownRenderer(contest, 'zh-TW')
        content = exporter.export()

        # Check that the content contains expected elements
        assert 'Test Contest' in content
        assert '**Name:** Test Contest' in content
        assert '### Description' in content
        assert 'Test Rules' in content
        assert '測試題目' in content
        assert '這是一個測試題目描述' in content
        assert 'Example 1' in content
        assert '1 2' in content
        assert '3' in content

    def test_markdown_exporter_includes_all_problems_with_page_breaks(self, contest, problem, user):
        """Ensure multiple problems are exported with separators for PDF pagination."""
        second_problem = _create_problem_with_asset(
            slug='test-second-problem', title='Second Problem', difficulty='easy',
            translations=[{
                'language': 'zh-TW', 'title': '第二題',
                'description': '第二題描述',
                'input_description': '', 'output_description': '', 'hint': '',
            }],
            owner=user,
        )

        bind_problem_to_contest(contest, second_problem, order=1)

        exporter = MarkdownRenderer(contest, 'zh-TW')
        content = exporter.export()

        assert '## Problems' in content
        assert 'Problem A' in content
        assert 'Problem B' in content
        assert '<div class="page-break"></div>' in content
    
    def test_markdown_exporter_english(self, contest, problem):
        """Test markdown export reads flat content fields from payload."""
        # Update asset payload to use flat content fields
        asset = problem.question_asset
        payload = asset.payload or {}
        payload['description'] = 'This is a test problem'
        payload['input_description'] = 'Input description'
        payload['output_description'] = 'Output description'
        payload['hint'] = ''
        asset.title = 'Test Problem Title'
        asset.payload = payload
        asset.save(update_fields=['payload', 'title'])

        exporter = MarkdownRenderer(contest, 'en')
        content = exporter.export()

        assert 'Test Contest' in content
        assert 'Test Problem Title' in content
    
    def test_pdf_exporter(self, contest, problem):
        """Test PDF export."""
        exporter = PDFRenderer(contest, 'zh-TW')
        pdf_file = exporter.export()
        
        # Check that a PDF file was created
        assert isinstance(pdf_file, BytesIO)
        assert pdf_file.tell() == 0  # File pointer should be at start
        
        # Read content and check it's not empty
        content = pdf_file.read()
        assert len(content) > 0
        
        # PDF files start with %PDF
        assert content[:4] == b'%PDF'


@pytest.mark.django_db
class TestStudentReportRenderer:
    """Test student report exporter functionality."""
    
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
    def contest_with_times(self, teacher):
        """Create a contest with start and end times."""
        now = timezone.now()
        return Contest.objects.create(
            name='期中考試',
            description='程式設計期中考試',
            rules='考試規則',
            owner=teacher,
            status='published',
            start_time=now - timedelta(hours=2),
            end_time=now + timedelta(hours=1)
        )
    
    @pytest.fixture
    def problems_setup(self, contest_with_times, teacher):
        """Create multiple problems with different difficulties."""
        problems = []
        difficulties = [('easy', '簡單題'), ('medium', '中等題'), ('hard', '困難題')]

        for i, (difficulty, title) in enumerate(difficulties):
            problem = _create_problem_with_asset(
                slug=f'test-problem-{i+1}-{difficulty}',
                title=title,
                difficulty=difficulty,
                translations=[{
                    'language': 'zh-TW', 'title': title,
                    'description': f'{title}描述',
                    'input_description': '輸入說明',
                    'output_description': '輸出說明',
                    'hint': '',
                }],
                owner=teacher,
            )

            # Add test cases with scores
            for j in range(2):
                ProblemTestCase.objects.create(
                    problem=problem,
                    input_data=f'{j+1}',
                    output_data=f'{j+1}',
                    is_sample=(j == 0),
                    score=10
                )

            bind_problem_to_contest(contest_with_times, problem, order=i)

            problems.append(problem)

        return problems
    
    @pytest.fixture
    def participant(self, contest_with_times, student):
        """Create a contest participant."""
        return ContestParticipant.objects.create(
            contest=contest_with_times,
            user=student,
            exam_status=ExamStatus.SUBMITTED,
            started_at=timezone.now() - timedelta(hours=1),
            left_at=timezone.now()
        )
    
    @pytest.fixture
    def submissions(self, contest_with_times, student, problems_setup):
        """Create submissions for the student."""
        submissions = []
        now = timezone.now()
        
        # Easy problem: AC on second try
        submissions.append(Submission.objects.create(
            user=student,
            problem=problems_setup[0],
            contest=contest_with_times,
            source_type='contest',
            language='cpp',
            code='#include <iostream>\nint main() { return 1; }',
            status='WA',
            score=0,
            created_at=now - timedelta(minutes=90)
        ))
        submissions.append(Submission.objects.create(
            user=student,
            problem=problems_setup[0],
            contest=contest_with_times,
            source_type='contest',
            language='cpp',
            code='#include <iostream>\nint main() {\n    int n;\n    std::cin >> n;\n    std::cout << n << std::endl;\n    return 0;\n}',
            status='AC',
            score=20,
            created_at=now - timedelta(minutes=80)
        ))
        
        # Medium problem: AC on first try
        submissions.append(Submission.objects.create(
            user=student,
            problem=problems_setup[1],
            contest=contest_with_times,
            source_type='contest',
            language='cpp',
            code='#include <iostream>\nusing namespace std;\nint main() {\n    int n;\n    cin >> n;\n    cout << n << endl;\n    return 0;\n}',
            status='AC',
            score=20,
            created_at=now - timedelta(minutes=60)
        ))
        
        # Hard problem: WA (not solved)
        submissions.append(Submission.objects.create(
            user=student,
            problem=problems_setup[2],
            contest=contest_with_times,
            source_type='contest',
            language='cpp',
            code='#include <iostream>\nint main() { return 0; }',
            status='WA',
            score=0,
            created_at=now - timedelta(minutes=30)
        ))
        
        return submissions
    
    def test_student_report_exporter_init(self, contest_with_times, student):
        """Test StudentReportRenderer initialization."""
        exporter = StudentReportRenderer(contest_with_times, student, 'zh-TW')
        
        assert exporter.contest == contest_with_times
        assert exporter.user == student
        assert exporter.language == 'zh-TW'
        assert exporter.scale == 1.0
    
    
    
    
    
    
    
    
    
    
    
    def test_export_pdf(self, contest_with_times, student, participant, problems_setup, submissions):
        """Test full PDF export."""
        exporter = StudentReportRenderer(contest_with_times, student, 'zh-TW')
        pdf_file = exporter.export()
        
        # Should return BytesIO
        assert isinstance(pdf_file, BytesIO)
        assert pdf_file.tell() == 0  # File pointer at start
        
        # Read content
        content = pdf_file.read()
        assert len(content) > 0
        
        # Should be a valid PDF
        assert content[:4] == b'%PDF'
    
    def test_export_with_no_submissions(self, contest_with_times, student, participant, problems_setup):
        """Test export when student has no submissions."""
        exporter = StudentReportRenderer(contest_with_times, student, 'zh-TW')
        pdf_file = exporter.export()
        
        # Should still generate a valid PDF
        assert isinstance(pdf_file, BytesIO)
        content = pdf_file.read()
        assert content[:4] == b'%PDF'
    
    def test_export_with_scale(self, contest_with_times, student, participant, problems_setup, submissions):
        """Test export with custom scale."""
        exporter = StudentReportRenderer(contest_with_times, student, 'zh-TW', scale=1.5)
        
        assert exporter.scale == 1.5
        
        pdf_file = exporter.export()
        assert isinstance(pdf_file, BytesIO)
    
    def test_scale_clamping(self, contest_with_times, student):
        """Test that scale values are properly clamped."""
        # Scale too low
        exporter_low = StudentReportRenderer(contest_with_times, student, scale=0.1)
        assert exporter_low.scale == 0.5
        
        # Scale too high
        exporter_high = StudentReportRenderer(contest_with_times, student, scale=5.0)
        assert exporter_high.scale == 2.0
        
        # Scale in range
        exporter_normal = StudentReportRenderer(contest_with_times, student, scale=1.2)
        assert exporter_normal.scale == 1.2
