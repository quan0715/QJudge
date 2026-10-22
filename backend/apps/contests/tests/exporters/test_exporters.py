"""
Tests for contest export functionality.
"""
import pytest
from io import BytesIO
from apps.contests.models import Contest
from apps.contests.tests import bind_problem_to_contest
from apps.contests.exporters import MarkdownRenderer, PDFRenderer
from apps.problems.models import CodingProblem, TestCase as ProblemTestCase
from apps.question_bank.models import QuestionAsset
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
            weight_percent=10,
        )

        # Add to contest
        bind_problem_to_contest(contest, problem, order=0, score=10)

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
