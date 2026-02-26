from django.contrib import admin
from .models import Classroom, ClassroomMember, ClassroomContest


class ClassroomMemberInline(admin.TabularInline):
    model = ClassroomMember
    extra = 0
    readonly_fields = ['joined_at']


class ClassroomContestInline(admin.TabularInline):
    model = ClassroomContest
    extra = 0
    readonly_fields = ['bound_at']


@admin.register(Classroom)
class ClassroomAdmin(admin.ModelAdmin):
    list_display = ['name', 'owner', 'invite_code', 'is_archived', 'created_at']
    list_filter = ['is_archived']
    search_fields = ['name', 'description']
    inlines = [ClassroomMemberInline, ClassroomContestInline]
