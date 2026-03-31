from django.contrib import admin
from .models import Subscription, WebhookEvent


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ["user", "tier", "status", "current_period_end", "updated_at"]
    list_filter = ["tier", "status"]
    search_fields = ["user__email", "user__username", "recur_subscription_id"]


@admin.register(WebhookEvent)
class WebhookEventAdmin(admin.ModelAdmin):
    list_display = ["event_id", "event_type", "processed_at"]
    list_filter = ["event_type"]
    search_fields = ["event_id"]
