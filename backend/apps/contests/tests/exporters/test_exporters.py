"""
Tests for contest export functionality.
"""
import pytest
from io import BytesIO
from datetime import timedelta
from django.utils import timezone
from apps.contests.models import Contest, ContestProblem, ContestParticipant, ExamStatus
from apps.contests.exporters import MarkdownExporter, PDFExporter, StudentReportExporter
from apps.problems.models import Problem, ProblemTranslation, TestCase as ProblemTestCase
from apps.submissions.models import Submission
from apps.users.models import User


# Alias for backward compatibility
Translation = ProblemTranslation


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
    def problem(self, contest):
        """Create a test problem with translation and test cases."""
        problem = Problem.objects.create(
            title='Test Problem',
            slug='test-problem-main',
            time_limit=1000,
            memory_limit=128,
            difficulty='medium',
            is_visible=True
        )
        
        # Add translation
        Translation.objects.create(
            problem=problem,
            language='zh-TW',
            title='測試題目',
            description='這是一個測試題目描述',
            input_description='輸入說明',
            output_description='輸出說明',
            hint='提示內容'
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
        ContestProblem.objects.create(
            contest=contest,
            problem=problem,
            order=0
        )
        
        return problem
    
    def test_markdown_exporter(self, contest, problem):
        """Test markdown export."""
        exporter = MarkdownExporter(contest, 'zh-TW')
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

    def test_markdown_exporter_includes_all_problems_with_page_breaks(self, contest, problem):
        """Ensure multiple problems are exported with separators for PDF pagination."""
        second_problem = Problem.objects.create(
            title='Second Problem',
            slug='test-second-problem',
            time_limit=2000,
            memory_limit=256,
            difficulty='easy',
            is_visible=True
        )

        Translation.objects.create(
            problem=second_problem,
            language='zh-TW',
            title='第二題',
            description='第二題描述'
        )

        ContestProblem.objects.create(
            contest=contest,
            problem=second_problem,
            order=1
        )

        exporter = MarkdownExporter(contest, 'zh-TW')
        content = exporter.export()

        assert '## Problems' in content
        assert 'Problem A' in content
        assert 'Problem B' in content
        assert '<div class="page-break"></div>' in content
    
    def test_markdown_exporter_english(self, contest, problem):
        """Test markdown export with English language."""
        # Add English translation
        Translation.objects.create(
            problem=problem,
            language='en',
            title='Test Problem Title',
            description='This is a test problem',
            input_description='Input description',
            output_description='Output description'
        )
        
        exporter = MarkdownExporter(contest, 'en')
        content = exporter.export()
        
        assert 'Test Contest' in content
        assert 'Test Problem Title' in content
    
    def test_pdf_exporter(self, contest, problem):
        """Test PDF export."""
        exporter = PDFExporter(contest, 'zh-TW')
        pdf_file = exporter.export()
        
        # Check that a PDF file was created
        assert isinstance(pdf_file, BytesIO)
        assert pdf_file.tell() == 0  # File pointer should be at start
        
        # Read content and check it's not empty
        content = pdf_file.read()
        assert len(content) > 0
        
        # PDF files start with %PDF
        assert content[:4] == b'%PDF'
    
    def test_format_problem_content(self, contest, problem):
        """Test problem content formatting."""
        exporter = MarkdownExporter(contest, 'zh-TW')
        problem_data = exporter.format_problem_content(problem, 'A')
        
        assert problem_data['label'] == 'A'
        assert problem_data['title'] == '測試題目'
        assert problem_data['description'] == '這是一個測試題目描述'
        assert len(problem_data['sample_cases']) == 1
        assert problem_data['sample_cases'][0]['input'] == '1 2'
        assert problem_data['sample_cases'][0]['output'] == '3'


@pytest.mark.django_db
class TestStudentReportExporter:
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
    def problems_setup(self, contest_with_times):
        """Create multiple problems with different difficulties."""
        problems = []
        difficulties = [('easy', '簡單題'), ('medium', '中等題'), ('hard', '困難題')]

        for i, (difficulty, title) in enumerate(difficulties):
            problem = Problem.objects.create(
                title=f'Problem {i+1}',
                slug=f'test-problem-{i+1}-{difficulty}',
                time_limit=1000,
                memory_limit=128,
                difficulty=difficulty,
                is_visible=True
            )
            
            Translation.objects.create(
                problem=problem,
                language='zh-TW',
                title=title,
                description=f'{title}描述',
                input_description='輸入說明',
                output_description='輸出說明'
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
            
            ContestProblem.objects.create(
                contest=contest_with_times,
                problem=problem,
                order=i
            )
            
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
        """Test StudentReportExporter initialization."""
        exporter = StudentReportExporter(contest_with_times, student, 'zh-TW')
        
        assert exporter.contest == contest_with_times
        assert exporter.user == student
        assert exporter.language == 'zh-TW'
        assert exporter.scale == 1.0
    
    def test_get_user_submissions(self, contest_with_times, student, participant, submissions):
        """Test getting user submissions."""
        exporter = StudentReportExporter(contest_with_times, student)
        user_submissions = exporter.get_user_submissions()
        
        assert len(user_submissions) == 4
        # Submissions should be ordered by created_at
        assert all(
            user_submissions[i].created_at <= user_submissions[i+1].created_at
            for i in range(len(user_submissions) - 1)
        )
    
    def test_calculate_standings(self, contest_with_times, student, participant, problems_setup, submissions):
        """Test standings calculation."""
        exporter = StudentReportExporter(contest_with_times, student)
        standings = exporter.calculate_standings()
        
        assert standings['rank'] == 1  # Only participant
        assert standings['total_participants'] == 1
        assert standings['user_stats'] is not None
        assert standings['user_stats']['solved'] == 2  # Easy and Medium solved
        assert standings['user_stats']['total_score'] == 40  # 20 + 20
    
    def test_get_difficulty_stats(self, contest_with_times, student, participant, problems_setup, submissions):
        """Test difficulty statistics."""
        exporter = StudentReportExporter(contest_with_times, student)
        stats = exporter.get_difficulty_stats()
        
        assert stats['easy']['solved'] == 1
        assert stats['easy']['total'] == 1
        assert stats['medium']['solved'] == 1
        assert stats['medium']['total'] == 1
        assert stats['hard']['solved'] == 0
        assert stats['hard']['total'] == 1
    
    def test_get_last_ac_submission(self, contest_with_times, student, participant, problems_setup, submissions):
        """Test getting last AC submission for a problem."""
        exporter = StudentReportExporter(contest_with_times, student)
        
        # Should get the AC submission for easy problem
        ac_submission = exporter.get_last_ac_submission(problems_setup[0].id)
        assert ac_submission is not None
        assert ac_submission.status == 'AC'
        
        # Should return None for hard problem (no AC)
        no_ac = exporter.get_last_ac_submission(problems_setup[2].id)
        assert no_ac is None
    
    def test_highlight_code(self, contest_with_times, student):
        """Test code syntax highlighting."""
        exporter = StudentReportExporter(contest_with_times, student)
        
        code = '#include <iostream>\nint main() { return 0; }'
        highlighted = exporter.highlight_code(code, 'cpp')
        
        # Should contain HTML formatting
        assert '<' in highlighted
        assert 'class=' in highlighted or 'style=' in highlighted
        # Should contain the original code elements
        assert 'include' in highlighted
        assert 'main' in highlighted
    
    def test_generate_scatter_chart_svg(self, contest_with_times, student, participant, problems_setup, submissions):
        """Test scatter chart SVG generation."""
        exporter = StudentReportExporter(contest_with_times, student)
        user_submissions = exporter.get_user_submissions()
        contest_problems = exporter.get_contest_problems()
        
        svg = exporter.generate_scatter_chart_svg(user_submissions, contest_problems)
        
        # Should be valid SVG
        assert '<svg' in svg
        assert '</svg>' in svg
        # Should contain circles for submissions
        assert '<circle' in svg
    
    def test_generate_cumulative_chart_svg(self, contest_with_times, student, participant, problems_setup, submissions):
        """Test cumulative line chart SVG generation."""
        exporter = StudentReportExporter(contest_with_times, student)
        user_submissions = exporter.get_user_submissions()
        
        svg = exporter.generate_cumulative_chart_svg(user_submissions)
        
        # Should be valid SVG
        assert '<svg' in svg
        assert '</svg>' in svg
        # Should contain path for line
        assert '<path' in svg
    
    def test_render_score_cards(self, contest_with_times, student, participant, problems_setup, submissions):
        """Test score cards rendering."""
        exporter = StudentReportExporter(contest_with_times, student)
        html = exporter.render_score_cards()
        
        assert 'score-cards' in html
        assert 'score-card' in html
        # Should show score, solved count
        assert '40' in html  # Total score
        assert '2' in html   # Solved count
    
    def test_render_difficulty_stats(self, contest_with_times, student, participant, problems_setup, submissions):
        """Test difficulty stats rendering."""
        exporter = StudentReportExporter(contest_with_times, student)
        html = exporter.render_difficulty_stats()
        
        # Check for difficulty section structure (using donut charts)
        assert 'donut-item' in html or 'difficulty-row' in html
        assert '簡單' in html or 'Easy' in html
        assert '中等' in html or 'Medium' in html
        assert '困難' in html or 'Hard' in html
    
    def test_render_problem_details(self, contest_with_times, student, participant, problems_setup, submissions):
        """Test problem details rendering with AC code."""
        exporter = StudentReportExporter(contest_with_times, student)
        html = exporter.render_problem_details()
        
        # Should contain problem sections
        assert 'problem-detail-card' in html
        assert '簡單題' in html
        assert '中等題' in html
        assert '困難題' in html
        
        # Should contain AC status
        assert 'AC' in html
        
        # Should contain code for AC problems
        assert '#include' in html or 'iostream' in html
    
    def test_export_pdf(self, contest_with_times, student, participant, problems_setup, submissions):
        """Test full PDF export."""
        exporter = StudentReportExporter(contest_with_times, student, 'zh-TW')
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
        exporter = StudentReportExporter(contest_with_times, student, 'zh-TW')
        pdf_file = exporter.export()
        
        # Should still generate a valid PDF
        assert isinstance(pdf_file, BytesIO)
        content = pdf_file.read()
        assert content[:4] == b'%PDF'
    
    def test_export_with_scale(self, contest_with_times, student, participant, problems_setup, submissions):
        """Test export with custom scale."""
        exporter = StudentReportExporter(contest_with_times, student, 'zh-TW', scale=1.5)
        
        assert exporter.scale == 1.5
        
        pdf_file = exporter.export()
        assert isinstance(pdf_file, BytesIO)
    
    def test_scale_clamping(self, contest_with_times, student):
        """Test that scale values are properly clamped."""
        # Scale too low
        exporter_low = StudentReportExporter(contest_with_times, student, scale=0.1)
        assert exporter_low.scale == 0.5
        
        # Scale too high
        exporter_high = StudentReportExporter(contest_with_times, student, scale=5.0)
        assert exporter_high.scale == 2.0
        
        # Scale in range
        exporter_normal = StudentReportExporter(contest_with_times, student, scale=1.2)
        assert exporter_normal.scale == 1.2
    
    def test_empty_chart_svg(self, contest_with_times, student, participant, problems_setup):
        """Test chart SVG when no submissions (empty state)."""
        exporter = StudentReportExporter(contest_with_times, student)
        
        # No submissions
        svg = exporter.generate_scatter_chart_svg([], exporter.get_contest_problems())
        
        assert '<svg' in svg
        assert '無提交記錄' in svg or 'No submissions' in svg
