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
        ('email', 'Email/Password'),
        ('nycu-oauth', 'NYCU OAuth'),
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
    
    # Preferences
    preferred_language = models.CharField(
        max_length=20,
        default='zh-hant',
        verbose_name='偏好語言'
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
        
        submissions = Submission.objects.filter(user=self.user)
        self.submission_count = submissions.count()
        
        accepted = submissions.filter(status='AC').values('problem').distinct().count()
        self.solved_count = accepted
        
        if self.submission_count > 0:
            self.accept_rate = (accepted / submissions.values('problem').distinct().count()) * 100
        else:
            self.accept_rate = 0.00
        
        self.save()
