"""
User models for authentication and profiles.
"""
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.core.validators import EmailValidator
from django.utils.translation import gettext_lazy as _


class User(AbstractUser):
    """
    Custom user model supporting multiple authentication methods.
    """
    AUTH_PROVIDER_CHOICES = [
        ('email', 'Password credentials'),
        ('nycu', 'NYCU OAuth'),
        ('google', 'Google'),
        ('github', 'GitHub'),
    ]
    
    ROLE_CHOICES = [
        ('student', '學生'),
        ('teacher', '教師'),
        ('admin', '管理員'),
    ]
    
    # Override email to make it required and unique
    email = models.EmailField(
        _('email address'),
        unique=True,
        validators=[EmailValidator()],
        error_messages={
            'unique': _('A user with that email already exists.'),
        }
    )
    
    # Authentication related
    auth_provider = models.CharField(
        max_length=20,
        choices=AUTH_PROVIDER_CHOICES,
        default='email',
        db_index=True,
        verbose_name='認證方式'
    )
    oauth_id = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        db_index=True,
        verbose_name='OAuth ID'
    )
    email_verified = models.BooleanField(
        default=False,
        verbose_name='Email 已驗證'
    )
    email_verification_token = models.CharField(
        max_length=255,
        null=True,
        blank=True
    )
    email_verification_expires_at = models.DateTimeField(
        null=True,
        blank=True
    )
    
    # Password reset
    password_reset_token = models.CharField(
        max_length=255,
        null=True,
        blank=True
    )
    password_reset_expires_at = models.DateTimeField(
        null=True,
        blank=True
    )
    
    # Role and permissions
    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default='student',
        db_index=True,
        verbose_name='角色'
    )
    
    # Timestamps
    last_login_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='最後登入時間'
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='更新時間'
    )
    
    class Meta:
        db_table = 'users'
        verbose_name = '使用者'
        verbose_name_plural = '使用者'
        indexes = [
            models.Index(fields=['email']),
            models.Index(fields=['username']),
            models.Index(fields=['auth_provider', 'oauth_id']),
            models.Index(fields=['role']),
        ]
        constraints = [
            # Ensure email users have password
            models.CheckConstraint(
                check=(
                    ~models.Q(auth_provider='email', password='') |
                    models.Q(auth_provider='email', password__isnull=False)
                ),
                name='email_users_must_have_password'
            ),
        ]
    
    def __str__(self):
        return f"{self.username} ({self.email})"
    
    @property
    def is_student(self):
        return self.role == 'student'
    
    @property
    def is_teacher(self):
        return self.role == 'teacher'
    
    @property
    def is_admin_role(self):
        return self.role == 'admin'


class UserProfile(models.Model):
    """
    Extended user profile with statistics and preferences.
    """
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='profile',
        verbose_name='使用者'
    )
    
    # Statistics
    solved_count = models.IntegerField(
        default=0,
        verbose_name='已解題數'
    )
    submission_count = models.IntegerField(
        default=0,
        verbose_name='提交次數'
    )
    accept_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0.00,
        verbose_name='通過率'
    )
    
    # Display name
    display_name = models.CharField(
        max_length=50,
        blank=True,
        default='',
        verbose_name='顯示名稱'
    )
    AVATAR_SOURCE_CHOICES = [
        ('manual', 'Manual'),
        ('oauth', 'OAuth'),
    ]
    avatar_url = models.URLField(
        max_length=500,
        blank=True,
        null=True,
        default='',
        verbose_name='頭像 URL'
    )
    avatar_source = models.CharField(
        max_length=20,
        choices=AVATAR_SOURCE_CHOICES,
        default='manual',
        verbose_name='頭像來源'
    )

    # Preferences
    LANGUAGE_CHOICES = [
        ('zh-TW', '繁體中文'),
        ('en', 'English'),
        ('ja', '日本語'),
        ('ko', '한국어'),
    ]

    preferred_language = models.CharField(
        max_length=20,
        choices=LANGUAGE_CHOICES,
        default='zh-TW',
        verbose_name='偏好語言'
    )
    
    THEME_CHOICES = [
        ('light', 'Light'),
        ('dark', 'Dark'),
        ('system', 'System'),
    ]
    
    preferred_theme = models.CharField(
        max_length=10,
        choices=THEME_CHOICES,
        default='system',
        verbose_name='偏好主題'
    )
    
    # Editor preferences
    editor_font_size = models.IntegerField(
        default=14,
        verbose_name='編輯器字體大小'
    )
    
    TAB_SIZE_CHOICES = [
        (2, '2 spaces'),
        (4, '4 spaces'),
    ]
    
    editor_tab_size = models.IntegerField(
        choices=TAB_SIZE_CHOICES,
        default=4,
        verbose_name='Tab 寬度'
    )

    onboarding_completed_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='完成 onboarding 時間'
    )
    
    # Timestamps
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='建立時間'
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='更新時間'
    )
    
    class Meta:
        db_table = 'user_profiles'
        verbose_name = '使用者資料'
        verbose_name_plural = '使用者資料'
    
    def __str__(self):
        return f"Profile of {self.user.username}"
    
    def update_statistics(self):
        """Update user statistics based on submissions."""
        from apps.submissions.models import Submission

        submissions = Submission.objects.filter(user=self.user, is_test=False)
        self.submission_count = submissions.count()

        accepted = submissions.filter(status='AC').values('problem').distinct().count()
        self.solved_count = accepted

        if self.submission_count > 0:
            self.accept_rate = (accepted / submissions.values('problem').distinct().count()) * 100
        else:
            self.accept_rate = 0.00

        self.save()


class ExternalIdentity(models.Model):
    """External provider identity linked to a QJudge user."""

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='external_identities',
        verbose_name='使用者',
    )
    provider_key = models.CharField(
        max_length=64,
        db_index=True,
        verbose_name='Provider Key',
    )
    subject = models.CharField(
        max_length=255,
        verbose_name='Provider Subject',
    )
    email = models.EmailField(
        blank=True,
        default='',
        db_index=True,
        verbose_name='Provider Email',
    )
    email_verified = models.BooleanField(
        default=False,
        verbose_name='Provider Email 已驗證',
    )
    profile_snapshot = models.JSONField(
        blank=True,
        default=dict,
        verbose_name='Provider Profile Snapshot',
    )
    last_login_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='最後登入時間',
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='建立時間',
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='更新時間',
    )

    class Meta:
        db_table = 'external_identities'
        verbose_name = '外部身份'
        verbose_name_plural = '外部身份'
        constraints = [
            models.UniqueConstraint(
                fields=['provider_key', 'subject'],
                name='unique_external_identity_provider_subject',
            ),
        ]
        indexes = [
            models.Index(fields=['user', 'provider_key']),
            models.Index(fields=['provider_key', 'email']),
        ]

    def __str__(self):
        return f"{self.provider_key}:{self.subject} -> {self.user_id}"


class TeacherActivationInvite(models.Model):
    """Invite link that lets a specific email activate teacher access."""

    email = models.EmailField(
        validators=[EmailValidator()],
        db_index=True,
        verbose_name='邀請 Email',
    )
    token_digest = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        verbose_name='Token 雜湊',
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='issued_teacher_activation_invites',
        verbose_name='建立者',
    )
    target_user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name='teacher_activation_invites',
        null=True,
        blank=True,
        verbose_name='目標使用者',
    )
    consumed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name='consumed_teacher_activation_invites',
        null=True,
        blank=True,
        verbose_name='使用者',
    )
    expires_at = models.DateTimeField(
        verbose_name='過期時間',
    )
    consumed_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='使用時間',
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='建立時間',
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='更新時間',
    )

    class Meta:
        db_table = 'teacher_activation_invites'
        verbose_name = '教師開通邀請'
        verbose_name_plural = '教師開通邀請'
        indexes = [
            models.Index(fields=['email']),
            models.Index(fields=['expires_at']),
        ]

    def __str__(self):
        return f"Teacher invite for {self.email}"


class UserLoginRecord(models.Model):
    """Tracks login events per device for session management."""

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='login_records',
    )
    device_id = models.CharField(max_length=128, blank=True, default='')
    ip_address = models.GenericIPAddressField()
    user_agent = models.CharField(max_length=512, blank=True, default='')
    login_method = models.CharField(max_length=32)  # email, nycu, google, github, token_refresh
    jti = models.CharField(max_length=256, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    is_current = models.BooleanField(default=False)

    class Meta:
        db_table = 'user_login_records'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at']),
        ]

    def __str__(self):
        return f"{self.user.username} login at {self.created_at} ({self.login_method})"
