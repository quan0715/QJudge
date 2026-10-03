"""Private, per-answer appeal tickets and append-only conversation messages."""
from django.conf import settings
from django.db import models


class GradeAppeal(models.Model):
    exam_answer = models.OneToOneField('contests.ExamAnswer', on_delete=models.CASCADE, related_name='grade_appeal')
    status = models.CharField(max_length=10, choices=[('open', '未結案'), ('closed', '已結案')], default='open')
    created_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ['-created_at', '-id']


class GradeAppealMessage(models.Model):
    appeal = models.ForeignKey(GradeAppeal, on_delete=models.CASCADE, related_name='messages')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+')
    content = models.TextField(max_length=5000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
