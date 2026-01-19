"""
Models for problems, translations, and test cases.
"""
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.conf import settings
from .managers import ProblemQuerySet


class Problem(models.Model):
    """
    Core problem model.
    """
    DIFFICULTY_CHOICES = [
        ('easy', '簡單'),
        ('medium', '中等'),
        ('hard', '困難'),
    ]
    
    # Basic info
    title = models.CharField(max_length=255, verbose_name='標題')
    slug = models.SlugField(max_length=255, unique=True, blank=True, verbose_name='Slug')
    difficulty = models.CharField(
        max_length=10,
        choices=DIFFICULTY_CHOICES,
        default='medium',
        verbose_name='難度'
    )
    
    # Limits
    time_limit = models.IntegerField(default=1000, verbose_name='時間限制 (ms)')
    memory_limit = models.IntegerField(default=128, verbose_name='記憶體限制 (MB)')
    
    # Display ID (e.g., P001, Q001)
    display_id = models.CharField(
        max_length=20,
        unique=True,
        null=True,
        blank=True,
        verbose_name='顯示編號'
    )
    
    # Status
    is_visible = models.BooleanField(default=True, verbose_name='是否可見')
    order = models.IntegerField(default=0, verbose_name='排序')
    
    # Metadata
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_problems',
        verbose_name='建立者'
    )
    
    # Contest specific fields
    # DEPRECATED: The following fields are deprecated and will be removed in a future version
    # Use is_practice_visible and created_in_contest instead
    
    # New fields for MVP contest-to-practice flow
    is_practice_visible = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name='顯示在練習題庫',
        help_text='控制此題是否在練習題庫中顯示給學生'
    )
    created_in_contest = models.ForeignKey(
        'contests.Contest',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='originally_created_problems',
        verbose_name='來源競賽',
        help_text='記錄此題最初在哪場競賽中建立'
    )
    origin_problem = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='practice_copies',
        verbose_name='來源題目',
        help_text='若此題由競賽題複製而來，記錄原始題目'
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
        ordering = ['order', 'id']
        indexes = [
            models.Index(fields=['difficulty']),
            models.Index(fields=['is_visible']),
        ]
    
    def __str__(self):
        return f"{self.id}. {self.title}"
    
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
        Problem,
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
        return f"{self.problem.title} - {self.get_language_display()}"


class ProblemTranslation(models.Model):
    """
    Translations for problem content.
    """
    problem = models.ForeignKey(
        Problem,
        on_delete=models.CASCADE,
        related_name='translations',
        verbose_name='題目'
    )
    language = models.CharField(max_length=10, verbose_name='語言代碼')  # e.g., 'zh-TW', 'zh-hant', 'en'
    
    # Content
    title = models.CharField(max_length=255, verbose_name='標題')
    description = models.TextField(verbose_name='題目描述')
    input_description = models.TextField(verbose_name='輸入說明')
    output_description = models.TextField(verbose_name='輸出說明')
    hint = models.TextField(blank=True, verbose_name='提示')
    
    class Meta:
        db_table = 'problem_translations'
        verbose_name = '題目翻譯'
        verbose_name_plural = '題目翻譯'
        unique_together = ['problem', 'language']
    
    def __str__(self):
        return f"{self.problem.title} ({self.language})"


class TestCase(models.Model):
    """
    Test cases for problem judging.
    """
    problem = models.ForeignKey(
        Problem,
        on_delete=models.CASCADE,
        related_name='test_cases',
        verbose_name='題目'
    )
    
    input_data = models.TextField(verbose_name='輸入資料')
    output_data = models.TextField(verbose_name='輸出資料')
    
    is_sample = models.BooleanField(default=False, verbose_name='是否為範例')
    score = models.IntegerField(default=0, verbose_name='分數')
    order = models.IntegerField(default=0, verbose_name='排序')
    
    is_hidden = models.BooleanField(default=False, verbose_name='是否隱藏')
    
    class Meta:
        db_table = 'test_cases'
        verbose_name = '測試案例'
        verbose_name_plural = '測試案例'
        ordering = ['order', 'id']
    
    def __str__(self):
        return f"TestCase {self.id} for {self.problem.title}"


class ProblemDiscussion(models.Model):
    """
    Discussion threads for a problem.
    """

    problem = models.ForeignKey(
        Problem,
        on_delete=models.CASCADE,
        related_name="discussions",
        verbose_name="題目",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="problem_discussions",
        verbose_name="使用者",
    )
    title = models.CharField(max_length=255, verbose_name="標題")
    content = models.TextField(verbose_name="內容")
    is_deleted = models.BooleanField(default=False, verbose_name="是否已刪除")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="建立時間")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新時間")

    class Meta:
        db_table = "problem_discussions"
        verbose_name = "題目討論"
        verbose_name_plural = "題目討論"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["problem", "-created_at"]),
            models.Index(fields=["user", "-created_at"]),
        ]

    def __str__(self):
        return f"Discussion {self.id} for {self.problem_id}"


class ProblemDiscussionComment(models.Model):
    """
    Comments within a problem discussion.
    """

    discussion = models.ForeignKey(
        ProblemDiscussion,
        on_delete=models.CASCADE,
        related_name="comments",
        verbose_name="討論",
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="replies",
        verbose_name="上層留言",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="problem_discussion_comments",
        verbose_name="使用者",
    )
    content = models.TextField(verbose_name="內容")
    is_deleted = models.BooleanField(default=False, verbose_name="是否已刪除")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="建立時間")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新時間")

    class Meta:
        db_table = "problem_discussion_comments"
        verbose_name = "題目討論留言"
        verbose_name_plural = "題目討論留言"
        ordering = ["created_at", "id"]
        indexes = [
            models.Index(fields=["discussion", "-created_at"]),
        ]

    def __str__(self):
        return f"Comment {self.id} on discussion {self.discussion_id}"


class DiscussionLike(models.Model):
    """
    Likes on a problem discussion.
    Each user can like a discussion only once.
    """

    discussion = models.ForeignKey(
        ProblemDiscussion,
        on_delete=models.CASCADE,
        related_name="likes",
        verbose_name="討論",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="discussion_likes",
        verbose_name="使用者",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="建立時間")

    class Meta:
        db_table = "problem_discussion_likes"
        verbose_name = "討論按讚"
        verbose_name_plural = "討論按讚"
        unique_together = ["discussion", "user"]
        indexes = [
            models.Index(fields=["discussion"]),
            models.Index(fields=["user"]),
        ]

    def __str__(self):
        return f"Like by {self.user_id} on discussion {self.discussion_id}"


class CommentLike(models.Model):
    """
    Likes on a problem discussion comment.
    Each user can like a comment only once.
    """

    comment = models.ForeignKey(
        ProblemDiscussionComment,
        on_delete=models.CASCADE,
        related_name="likes",
        verbose_name="評論",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="comment_likes",
        verbose_name="使用者",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="建立時間")

    class Meta:
        db_table = "problem_discussion_comment_likes"
        verbose_name = "評論按讚"
        verbose_name_plural = "評論按讚"
        unique_together = ["comment", "user"]
        indexes = [
            models.Index(fields=["comment"]),
            models.Index(fields=["user"]),
        ]

    def __str__(self):
        return f"Like by {self.user_id} on comment {self.comment_id}"


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
