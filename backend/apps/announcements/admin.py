from django.contrib import admin
from .models import Announcement

@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ('title', 'author', 'visible', 'created_at')
    list_filter = ('visible', 'created_at')
    search_fields = ('title', 'content')
