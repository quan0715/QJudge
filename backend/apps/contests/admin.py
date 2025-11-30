"""
Admin configuration for contests app.
"""
from django.contrib import admin
from .models import Contest, ContestProblem, ContestParticipant, ContestQuestion


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
    list_display = ['title', 'start_time', 'end_time', 'creator', 'is_public']
    list_filter = ['is_public', 'start_time']
    search_fields = ['title', 'description']
    inlines = [ContestProblemInline, ContestParticipantInline]


@admin.register(ContestQuestion)
class ContestQuestionAdmin(admin.ModelAdmin):
    list_display = ['title', 'contest', 'user', 'created_at', 'replied_by']
    list_filter = ['contest', 'created_at']
    search_fields = ['title', 'content', 'reply']
