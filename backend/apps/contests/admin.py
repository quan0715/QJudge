"""
Admin configuration for contests app.
"""
from django.contrib import admin
from .models import (
    Contest,
    ContestProblem,
    ContestParticipant,
    Clarification,
    ExamEvent,
    ExamQuestion,
    ExamAnswer,
)


class ContestProblemInline(admin.TabularInline):
    model = ContestProblem
    extra = 1


class ContestParticipantInline(admin.TabularInline):
    model = ContestParticipant
    extra = 0
    readonly_fields = ['score', 'rank', 'joined_at']
    can_delete = False


@admin.register(Contest)
class ContestAdmin(admin.ModelAdmin):
    list_display = ['name', 'start_time', 'end_time', 'owner', 'visibility', 'status']
    list_filter = ['visibility', 'status', 'start_time']
    search_fields = ['name', 'description']
    inlines = [ContestProblemInline, ContestParticipantInline]


@admin.register(Clarification)
class ClarificationAdmin(admin.ModelAdmin):
    list_display = ['id', 'contest', 'author', 'status', 'created_at']
    list_filter = ['status', 'is_public', 'contest']
    search_fields = ['question', 'answer', 'author__username']


@admin.register(ExamEvent)
class ExamEventAdmin(admin.ModelAdmin):
    list_display = ['event_type', 'contest', 'user', 'created_at']
    list_filter = ['event_type', 'contest']
    search_fields = ['user__username', 'metadata']


@admin.register(ExamQuestion)
class ExamQuestionAdmin(admin.ModelAdmin):
    list_display = ['id', 'contest', 'question_type', 'score', 'order', 'updated_at']
    list_filter = ['question_type', 'contest']
    search_fields = ['prompt']
    ordering = ['contest', 'order', 'id']


@admin.register(ExamAnswer)
class ExamAnswerAdmin(admin.ModelAdmin):
    list_display = ['id', 'participant', 'question', 'is_correct', 'score', 'graded_by', 'updated_at']
    list_filter = ['is_correct', 'question__contest']
    search_fields = ['participant__user__username', 'feedback']
    readonly_fields = ['created_at', 'updated_at']
