"""
Admin configuration for problems app.
"""
from django.contrib import admin
from .models import Problem, TestCase, LanguageConfig, Tag


class TestCaseInline(admin.TabularInline):
    model = TestCase
    extra = 1
    fields = ['input_data', 'output_data', 'is_sample', 'score', 'order', 'is_hidden']


@admin.register(LanguageConfig)
class LanguageConfigAdmin(admin.ModelAdmin):
    list_display = ['problem', 'language', 'is_enabled', 'order']
    list_filter = ['language', 'is_enabled']
    search_fields = ['problem__question_asset__title']


@admin.register(Problem)
class ProblemAdmin(admin.ModelAdmin):
    list_display = ['id', 'slug', 'submission_count', 'acceptance_rate']
    list_filter = ['created_at']
    search_fields = ['question_asset__title']
    inlines = [TestCaseInline]


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'color', 'created_at']
    search_fields = ['name', 'slug']
    prepopulated_fields = {'slug': ('name',)}
