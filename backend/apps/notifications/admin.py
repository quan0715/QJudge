from django.contrib import admin

from .models import EmailNotification


@admin.register(EmailNotification)
class EmailNotificationAdmin(admin.ModelAdmin):
    list_display = [
        'short_subject', 'recipient_email', 'notification_type',
        'status', 'retry_count', 'created_at', 'sent_at',
    ]
    list_filter = ['status', 'notification_type', 'created_at']
    search_fields = ['recipient_email', 'subject']
    readonly_fields = [
        'id', 'recipient', 'recipient_email', 'notification_type',
        'subject', 'body_text', 'body_html', 'status', 'retry_count',
        'error_message', 'content_type', 'object_id', 'triggered_by',
        'created_at', 'sent_at',
    ]
    ordering = ['-created_at']

    def short_subject(self, obj):
        return obj.subject[:60] + ('...' if len(obj.subject) > 60 else '')
    short_subject.short_description = '主旨'

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
