"""
Models for coding problems and test cases.

The canonical content (title, difficulty, translations) is owned by
QuestionAsset.  CodingProblem is the *execution adapter* that owns
time_limit, memory_limit, test_cases, language_configs, and keywords.
"""
import uuid

from django.db import models
from django.utils.translation import gettext_lazy as _
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
    question_version = models.ForeignKey(
        'question_bank.QuestionVersion',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='coding_problem_adapters',
        verbose_name='對應題目版本',
    )
    
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='建立時間')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新時間')
    
    # Statistics (denormalized for performance)
    submission_count = models.IntegerField(default=0, verbose_name='提交次數')
    accepted_count = models.IntegerField(default=0, verbose_name='通過次數')
    wa_count = models.IntegerField(default=0, verbose_name='答案錯誤次數')
    tle_count = models.IntegerField(default=0, verbose_name='超時次數')
    mle_count = models.IntegerField(default=0, verbose_name='記憶體超限次數')
    re_count = models.IntegerField(default=0, verbose_name='執行錯誤次數')
    ce_count = models.IntegerField(default=0, verbose_name='編譯錯誤次數')
    
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

    @property
    def acceptance_rate(self):
        if self.submission_count == 0:
            return 0.0
        return (self.accepted_count / self.submission_count) * 100


class LanguageConfig(models.Model):
    """
    Language-specific configuration for each problem.
    Note: Frontend currently only supports C++, but backend maintains 
    compatibility with other languages for legacy data.
    """
    LANGUAGE_CHOICES = [
        ('cpp', 'C++'),
        ('python', 'Python'),
        ('java', 'Java'),
        ('javascript', 'JavaScript'),
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
    score = models.IntegerField(default=0, verbose_name='分數')
    weight_percent = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        verbose_name='權重百分比',
        help_text='建議使用 0~100 的整數百分比；同題測資加總應為 100',
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
