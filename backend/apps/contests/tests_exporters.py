"""
Tests for contest export functionality.
"""
import pytest
from io import BytesIO
from apps.contests.models import Contest, ContestProblem
from apps.contests.exporters import MarkdownExporter, PDFExporter
from apps.problems.models import Problem, Translation, TestCase
from apps.users.models import User


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
            status='active'
        )
    
    @pytest.fixture
    def problem(self, contest):
        """Create a test problem with translation and test cases."""
        problem = Problem.objects.create(
            title='Test Problem',
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
        TestCase.objects.create(
            problem=problem,
            input='1 2',
            output='3',
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
        assert '測試題目' in content
        assert '這是一個測試題目描述' in content
        assert 'Example 1' in content
        assert '1 2' in content
        assert '3' in content
    
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
