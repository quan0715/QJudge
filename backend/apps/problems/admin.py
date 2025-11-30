"""
Admin configuration for problems app.
"""
from django.contrib import admin
from .models import Problem, ProblemTranslation, TestCase, LanguageConfig


class ProblemTranslationInline(admin.StackedInline):
    model = ProblemTranslation
    extra = 1


class TestCaseInline(admin.TabularInline):
    model = TestCase
    extra = 1
    fields = ['input_data', 'output_data', 'is_sample', 'score', 'order', 'is_hidden']


@admin.register(LanguageConfig)
class LanguageConfigAdmin(admin.ModelAdmin):
    list_display = ['problem', 'language', 'is_enabled', 'order']
    list_filter = ['language', 'is_enabled']
    search_fields = ['problem__title']


@admin.register(Problem)
class ProblemAdmin(admin.ModelAdmin):
    list_display = ['id', 'title', 'difficulty', 'is_visible', 'submission_count', 'acceptance_rate']
    list_filter = ['difficulty', 'is_visible', 'created_at']
    search_fields = ['title', 'translations__title']
    inlines = [ProblemTranslationInline, TestCaseInline]
    prepopulated_fields = {'slug': ('title',)}
