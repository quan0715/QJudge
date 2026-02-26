"""
Models for classrooms.
"""
from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class Classroom(models.Model):
    """
    A classroom represents a course (e.g. "Data Structures 2026 Fall").
    """
    name = models.CharField(max_length=255, verbose_name='名稱')
    description = models.TextField(blank=True, verbose_name='描述')
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='owned_classrooms',
        verbose_name='擁有者',
    )
    admins = models.ManyToManyField(
        User,
        blank=True,
        related_name='admin_classrooms',
        verbose_name='管理員',
    )
    invite_code = models.CharField(
        max_length=8,
        unique=True,
        verbose_name='邀請碼',
    )
    invite_code_enabled = models.BooleanField(
        default=True,
        verbose_name='邀請碼啟用',
    )
    is_archived = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name='已封存',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='建立時間')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新時間')

    members = models.ManyToManyField(
        User,
        through='ClassroomMember',
        related_name='joined_classrooms',
        verbose_name='成員',
    )

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class ClassroomMember(models.Model):
    """
    Through-model for classroom membership.
    """
    ROLE_CHOICES = [
        ('student', 'Student'),
        ('ta', 'TA'),
    ]

    classroom = models.ForeignKey(
        Classroom,
        on_delete=models.CASCADE,
        related_name='memberships',
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='classroom_memberships',
    )
    role = models.CharField(
        max_length=10,
        choices=ROLE_CHOICES,
        default='student',
        verbose_name='角色',
    )
    joined_at = models.DateTimeField(auto_now_add=True, verbose_name='加入時間')

    class Meta:
        unique_together = ['classroom', 'user']

    def __str__(self):
        return f'{self.user.username} in {self.classroom.name} ({self.role})'


class ClassroomContest(models.Model):
    """
    Binding between a classroom and a contest.
    """
    classroom = models.ForeignKey(
        Classroom,
        on_delete=models.CASCADE,
        related_name='classroom_contests',
    )
    contest = models.ForeignKey(
        'contests.Contest',
        on_delete=models.CASCADE,
        related_name='classroom_bindings',
    )
    bound_at = models.DateTimeField(auto_now_add=True, verbose_name='綁定時間')

    class Meta:
        unique_together = ['classroom', 'contest']

    def __str__(self):
        return f'{self.classroom.name} ↔ {self.contest.name}'


class ClassroomAnnouncement(models.Model):
    """
    Announcement for a classroom.
    """
    classroom = models.ForeignKey(
        Classroom,
        on_delete=models.CASCADE,
        related_name='announcements',
        verbose_name='教室',
    )
    title = models.CharField(max_length=255, verbose_name='標題')
    content = models.TextField(verbose_name='內容')
    is_pinned = models.BooleanField(default=False, verbose_name='置頂')
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_classroom_announcements',
        verbose_name='發布者',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='發布時間')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新時間')

    class Meta:
        ordering = ['-is_pinned', '-created_at']

    def __str__(self):
        return self.title
