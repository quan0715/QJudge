"""
Models for coding problems and test cases.

The canonical content (title, difficulty, translations) is owned by
QuestionAsset.  CodingProblem is the *execution adapter* that owns
time_limit, memory_limit, test_cases, language_configs, and keywords.
"""
import uuid

from django.db import models
from django.conf import settings
from .managers import ProblemQuerySet


class CodingProblem(models.Model):
    """
    Execution adapter for coding-type questions.

    Content (title, difficulty, translations) is read from the linked
    QuestionAsset.  This model owns execution config: limits, test cases,
    language configs, and keyword restrictions.

    DB table stays ``problems`` for backward compatibility.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Basic info
    slug = models.SlugField(max_length=255, unique=True, blank=True, verbose_name='Slug')
    
    # Limits
    time_limit = models.IntegerField(default=1000, verbose_name='時間限制 (ms)')
    memory_limit = models.IntegerField(default=128, verbose_name='記憶體限制 (MB)')
    
    order = models.IntegerField(default=0, verbose_name='排序')
    
    # Metadata
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_problems',
        verbose_name='建立者'
    )
    
    question_asset = models.ForeignKey(
        'question_bank.QuestionAsset',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='coding_problem_adapters',
        verbose_name='對應題目資產',
    )
    
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='建立時間')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新時間')
    
    # Tags for categorization
    tags = models.ManyToManyField(
        'Tag',
        related_name='problems',
        blank=True,
        verbose_name='標籤'
    )
    
    # Keyword restrictions for code validation
    forbidden_keywords = models.JSONField(
        default=list,
        blank=True,
        verbose_name='禁用關鍵字',
        help_text='提交代碼中不可出現的關鍵字列表 (substring match)'
    )
    required_keywords = models.JSONField(
        default=list,
        blank=True,
        verbose_name='必須關鍵字',
        help_text='提交代碼中必須包含的關鍵字列表 (substring match)'
    )

    objects = ProblemQuerySet.as_manager()
    
    class Meta:
        db_table = 'problems'
        verbose_name = '題目'
        verbose_name_plural = '題目'
        ordering = ['order', 'created_at']

    def __str__(self):
        if self.question_asset_id:
            try:
                return f"{self.id}. {self.question_asset.title}"
            except Exception:
                pass
        return f"{self.id}"

    def public_sample_cases(self):
        """Sample cases a solver may see.

        The statement shows exactly these and a test run executes exactly
        these (plus the solver's own cases); hidden cases only ever run in a
        formal submission.
        """
        return self.test_cases.filter(is_sample=True, is_hidden=False)


class LanguageConfig(models.Model):
    """
    Language-specific configuration for each problem.
    Choices match the languages the judge can run.
    """
    LANGUAGE_CHOICES = [
        ('cpp', 'C++'),
        ('c', 'C'),
        ('python', 'Python'),
        ('java', 'Java'),
    ]
    
    problem = models.ForeignKey(
        CodingProblem,
        on_delete=models.CASCADE,
        related_name='language_configs',
        verbose_name='題目'
    )
    language = models.CharField(
        max_length=20,
        choices=LANGUAGE_CHOICES,
        verbose_name='程式語言'
    )
    template_code = models.TextField(
        blank=True,
        default='',
        verbose_name='範本程式碼'
    )
    is_enabled = models.BooleanField(
        default=True,
        verbose_name='啟用'
    )
    order = models.IntegerField(
        default=0,
        verbose_name='排序'
    )
    
    class Meta:
        db_table = 'problem_language_configs'
        verbose_name = '語言設定'
        verbose_name_plural = '語言設定'
        unique_together = ['problem', 'language']
        ordering = ['order', 'language']
    
    def __str__(self):
        return f"{self.problem_id} - {self.get_language_display()}"


class TestCase(models.Model):
    """
    Test cases for problem judging.
    """
    problem = models.ForeignKey(
        CodingProblem,
        on_delete=models.CASCADE,
        related_name='test_cases',
        verbose_name='題目'
    )
    
    input_data = models.TextField(verbose_name='輸入資料')
    output_data = models.TextField(verbose_name='輸出資料')
    
    is_sample = models.BooleanField(default=False, verbose_name='是否為範例')
    weight_percent = models.PositiveSmallIntegerField(
        verbose_name='權重百分比',
        help_text='0~100 的整數百分比；同題測資加總為 100',
    )
    order = models.IntegerField(default=0, verbose_name='排序')
    
    is_hidden = models.BooleanField(default=False, verbose_name='是否隱藏')
    
    class Meta:
        db_table = 'test_cases'
        verbose_name = '測試案例'
        verbose_name_plural = '測試案例'
        ordering = ['order', 'id']
    
    def __str__(self):
        return f"TestCase {self.id} for {self.problem_id}"


class Tag(models.Model):
    """
    Tags for categorizing problems (e.g., 'array', 'dynamic programming', 'graph').
    """
    name = models.CharField(max_length=50, unique=True, verbose_name='標籤名稱')
    slug = models.SlugField(max_length=50, unique=True, verbose_name='Slug')
    description = models.TextField(blank=True, verbose_name='描述')
    color = models.CharField(
        max_length=7,
        default='#0f62fe',
        verbose_name='顏色',
        help_text='Hex color code for tag display'
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='建立時間')
    
    class Meta:
        db_table = 'tags'
        verbose_name = '標籤'
        verbose_name_plural = '標籤'
        ordering = ['name']
    
    def __str__(self):
        return self.name
