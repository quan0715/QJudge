"""
Admin configuration for submissions app.
"""
from django.contrib import admin
from .models import Submission, SubmissionResult, ScreenEvent


class SubmissionResultInline(admin.TabularInline):
    model = SubmissionResult
    extra = 0
    readonly_fields = ['test_case', 'status', 'exec_time', 'memory_usage', 'output', 'error_message']
    can_delete = False


class ScreenEventInline(admin.TabularInline):
    model = ScreenEvent
    extra = 0
    readonly_fields = ['event_type', 'timestamp', 'details']
    can_delete = False


@admin.register(Submission)
class SubmissionAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'problem', 'status', 'score', 'language', 'created_at']
    list_filter = ['status', 'language', 'created_at']
    search_fields = ['user__username', 'problem__title']
    inlines = [SubmissionResultInline, ScreenEventInline]
    readonly_fields = ['code', 'error_message']
