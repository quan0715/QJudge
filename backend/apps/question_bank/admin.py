from django.contrib import admin

from .models import (
    ContestQuestionBinding,
    QuestionAsset,
    QuestionBank,
    QuestionBankMembership,
    QuestionBankSubscription,
    QuestionVersion,
)


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


@admin.register(QuestionAsset)
class QuestionAssetAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "asset_type",
        "title",
        "owner",
        "status",
        "visibility",
        "version_state",
        "updated_at",
    )
    list_filter = ("asset_type", "status", "visibility", "version_state")
    search_fields = ("title", "owner__username")


@admin.register(QuestionVersion)
class QuestionVersionAdmin(admin.ModelAdmin):
    list_display = ("id", "question_asset", "version_number", "title", "created_by", "created_at")
    list_filter = ("question_asset__asset_type",)
    search_fields = ("title", "question_asset__title")


@admin.register(QuestionBankMembership)
class QuestionBankMembershipAdmin(admin.ModelAdmin):
    list_display = ("id", "bank", "question_asset", "order", "added_by", "updated_at")
    list_filter = ("bank__category",)
    search_fields = ("bank__name", "question_asset__title")


@admin.register(ContestQuestionBinding)
class ContestQuestionBindingAdmin(admin.ModelAdmin):
    list_display = ("id", "contest", "binding_type", "question_asset", "coding_problem", "exam_question", "order")
    list_filter = ("binding_type", "source_mode")
    search_fields = ("contest__name", "question_asset__title")


@admin.register(QuestionBankSubscription)
class QuestionBankSubscriptionAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "bank", "created_at")
    search_fields = ("user__username", "bank__name")
