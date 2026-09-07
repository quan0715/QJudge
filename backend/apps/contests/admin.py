"""
Admin configuration for contests app.
"""
from django.contrib import admin
from .models import (
    Contest,
    ContestParticipant,
    Clarification,
    ExamEvent,
    ExamQuestion,
    ExamQuestionGroup,
    ExamAnswer,
    ExamEvidenceChunk,
    ExamIntegrityRun,
)


class ContestParticipantInline(admin.TabularInline):
    model = ContestParticipant
    extra = 0
    readonly_fields = ['score', 'rank', 'joined_at']
    can_delete = False


@admin.register(Contest)
class ContestAdmin(admin.ModelAdmin):
    list_display = ['name', 'start_time', 'end_time', 'owner', 'status']
    list_filter = ['status', 'start_time']
    search_fields = ['name', 'description']
    inlines = [ContestParticipantInline]


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


@admin.register(ExamIntegrityRun)
class ExamIntegrityRunAdmin(admin.ModelAdmin):
    list_display = ['id', 'contest', 'session_state', 'health', 'data_state', 'created_at']
    list_filter = ['session_state', 'health', 'data_state']
    search_fields = ['contest__name']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(ExamEvidenceChunk)
class ExamEvidenceChunkAdmin(admin.ModelAdmin):
    list_display = ['id', 'integrity_run', 'participant', 'source', 'chunk_seq', 'status']
    list_filter = ['source', 'status']
    search_fields = ['object_key', 'sha256', 'incident_id']
    readonly_fields = ['requested_at', 'uploaded_at', 'verified_at']


@admin.register(ExamQuestionGroup)
class ExamQuestionGroupAdmin(admin.ModelAdmin):
    list_display = ['id', 'contest', 'title', 'order', 'updated_at']
    list_filter = ['contest']
    search_fields = ['title', 'shared_stem_markdown']
    ordering = ['contest', 'order', 'id']


@admin.register(ExamQuestion)
class ExamQuestionAdmin(admin.ModelAdmin):
    list_display = ['id', 'contest', 'question_type', 'group', 'score', 'order', 'answer_format', 'updated_at']
    list_filter = ['question_type', 'answer_format', 'contest']
    search_fields = ['prompt']
    ordering = ['contest', 'order', 'id']


@admin.register(ExamAnswer)
class ExamAnswerAdmin(admin.ModelAdmin):
    list_display = ['id', 'participant', 'question', 'is_correct', 'score', 'graded_by', 'updated_at']
    list_filter = ['is_correct', 'question__contest']
    search_fields = ['participant__user__username', 'feedback']
    readonly_fields = ['created_at', 'updated_at']
