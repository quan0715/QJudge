from rest_framework import serializers
from .models import Subscription


class SubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subscription
        fields = [
            "tier",
            "status",
            "recur_subscription_id",
            "current_period_start",
            "current_period_end",
            "trial_end",
            "cancelled_at",
            "created_at",
        ]
        read_only_fields = fields


class CheckoutSessionSerializer(serializers.Serializer):
    product_slug = serializers.ChoiceField(choices=["pro", "team"])
