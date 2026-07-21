from rest_framework import serializers

from apps.contests.models import ExamIntegrityRun
from apps.contests.services.integrity_runs import create_run


class IntegrityRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamIntegrityRun
        exclude = ("token_digest",)
        read_only_fields = tuple(
            field.name
            for field in ExamIntegrityRun._meta.fields
            if field.name != "token_digest"
        )


class IntegrityRunCreateSerializer(serializers.Serializer):
    worker_image = serializers.CharField(required=False, max_length=255)

    def to_internal_value(self, data):
        unknown = set(data) - {"worker_image"}
        if unknown:
            raise serializers.ValidationError(
                {
                    key: ["This field is not accepted."]
                    for key in sorted(unknown)
                }
            )
        return super().to_internal_value(data)

    def create(self, validated_data):
        return create_run(
            self.context["contest"],
            actor=self.context["request"].user,
            worker_image=validated_data.get("worker_image"),
        )
