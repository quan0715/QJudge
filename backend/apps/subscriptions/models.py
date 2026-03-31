from django.db import models
from django.conf import settings


class Subscription(models.Model):
    TIER_CHOICES = [
        ("free", "Free"),
        ("pro", "Pro"),
        ("team", "Team"),
        ("enterprise", "Enterprise"),
    ]
    STATUS_CHOICES = [
        ("trialing", "Trialing"),
        ("active", "Active"),
        ("past_due", "Past Due"),
        ("cancelled", "Cancelled"),
        ("expired", "Expired"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="subscription",
    )
    tier = models.CharField(max_length=20, choices=TIER_CHOICES, default="free", db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active", db_index=True)

    recur_subscription_id = models.CharField(max_length=255, blank=True, default="", db_index=True)
    recur_customer_id = models.CharField(max_length=255, blank=True, default="")
    recur_product_id = models.CharField(max_length=255, blank=True, default="")

    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    trial_end = models.DateTimeField(null=True, blank=True)

    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "subscriptions"
        indexes = [
            models.Index(fields=["recur_subscription_id"]),
            models.Index(fields=["user", "status"]),
        ]

    def __str__(self):
        return f"{self.user.username} - {self.tier} ({self.status})"

    @property
    def is_active_subscription(self):
        return self.status in ("active", "trialing", "past_due")


class WebhookEvent(models.Model):
    event_id = models.CharField(max_length=255, unique=True)
    event_type = models.CharField(max_length=100)
    payload = models.JSONField()
    processed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "subscription_webhook_events"

    def __str__(self):
        return f"{self.event_type} ({self.event_id})"
