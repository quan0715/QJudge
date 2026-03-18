from django.contrib import admin

from .models import QuestionBank, Question, QuestionCodingExt


@admin.register(QuestionBank)
class QuestionBankAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "name",
        "owner",
        "category",
        "visibility",
        "verified",
        "is_archived",
        "updated_at",
    )
    list_filter = ("category", "visibility", "verified", "is_archived")
    search_fields = ("name", "owner__username")


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "bank",
        "question_type",
        "source_question",
        "source_bank",
        "updated_at",
    )
    list_filter = ("question_type", "bank__category")
    search_fields = ("title", "bank__name")


@admin.register(QuestionCodingExt)
class QuestionCodingExtAdmin(admin.ModelAdmin):
    list_display = ("id", "question")
    search_fields = ("question__title",)
