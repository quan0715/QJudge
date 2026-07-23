import json
import math
import re
from uuid import UUID

from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from apps.contests.models import ExamIntegrityRun
from apps.contests.services.integrity_runs import create_run


MAX_INTEGRITY_BATCH_BYTES = 1024 * 1024
MAX_INTEGRITY_PAYLOAD_BYTES = 32 * 1024
_EVENT_TYPE_RE = re.compile(r"[A-Za-z][A-Za-z0-9_]*\Z")


def _canonical_json_bytes(value) -> bytes:
    return json.dumps(
        value,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def canonical_integrity_batch_bytes(validated_data) -> bytes:
    return _canonical_json_bytes(_json_wire_value(validated_data))


def _json_wire_value(value):
    if isinstance(value, UUID):
        return str(value)
    if type(value) is dict:
        return {key: _json_wire_value(item) for key, item in value.items()}
    if type(value) is list:
        return [_json_wire_value(item) for item in value]
    return value


def _validate_json_value(value, path="$"):
    value_type = type(value)
    if value is None or value_type in (str, bool, int):
        return
    if value_type is float:
        if not math.isfinite(value):
            raise serializers.ValidationError(
                f"{path} must contain only finite JSON numbers."
            )
        return
    if value_type is list:
        for index, item in enumerate(value):
            _validate_json_value(item, f"{path}[{index}]")
        return
    if value_type is dict:
        for key, item in value.items():
            if type(key) is not str:
                raise serializers.ValidationError(
                    f"{path} must contain only string object keys."
                )
            _validate_json_value(item, f"{path}.{key}")
        return
    raise serializers.ValidationError(
        f"{path} must contain only JSON-compatible values."
    )


class _StrictSerializer(serializers.Serializer):
    strict_scalar_types = {}

    def to_internal_value(self, data):
        if type(data) is not dict:
            raise serializers.ValidationError("Expected a JSON object.")

        errors = {
            key: ["This field is not accepted."]
            for key in sorted(set(data) - set(self.fields))
        }
        for field_name, expected_types in self.strict_scalar_types.items():
            if field_name not in data:
                continue
            value = data[field_name]
            if type(value) not in expected_types:
                names = " or ".join(
                    expected_type.__name__ for expected_type in expected_types
                )
                errors[field_name] = [f"Expected {names} without coercion."]
        if errors:
            raise serializers.ValidationError(errors)
        return super().to_internal_value(data)


class ExamIntegrityRecordSerializer(_StrictSerializer):
    strict_scalar_types = {
        "event_id": (str,),
        "seq": (int,),
        "kind": (str,),
        "event_type": (str,),
        "event_schema_version": (int,),
        "client_occurred_at_ms": (int,),
        "client_recorded_at_ms": (int,),
        "monotonic_ms": (int, float),
    }

    event_id = serializers.UUIDField()
    seq = serializers.IntegerField(min_value=1)
    kind = serializers.ChoiceField(
        choices=("event", "state_snapshot"),
    )
    event_type = serializers.CharField(
        min_length=1,
        max_length=64,
        trim_whitespace=False,
    )
    event_schema_version = serializers.IntegerField(min_value=1)
    client_occurred_at_ms = serializers.IntegerField(min_value=0)
    client_recorded_at_ms = serializers.IntegerField(min_value=0)
    monotonic_ms = serializers.FloatField(min_value=0)
    payload = serializers.JSONField()
    evidence_descriptors = serializers.ListField(
        child=serializers.JSONField(),
        default=list,
        min_length=0,
    )

    def to_internal_value(self, data):
        if type(data) is dict:
            errors = {}
            if "payload" in data and type(data["payload"]) is not dict:
                errors["payload"] = ["Expected a JSON object."]
            if (
                "evidence_descriptors" in data
                and type(data["evidence_descriptors"]) is not list
            ):
                errors["evidence_descriptors"] = ["Expected a JSON array."]
            elif "evidence_descriptors" in data:
                for index, descriptor in enumerate(data["evidence_descriptors"]):
                    if type(descriptor) is not dict:
                        errors["evidence_descriptors"] = {
                            index: ["Expected a JSON object."]
                        }
                        break
            if errors:
                raise serializers.ValidationError(errors)
        return super().to_internal_value(data)

    def validate_event_type(self, value):
        if not _EVENT_TYPE_RE.fullmatch(value):
            raise serializers.ValidationError(
                "Must be a 1–64 character identifier."
            )
        return value

    def validate_payload(self, value):
        _validate_json_value(value)
        if len(_canonical_json_bytes(value)) > MAX_INTEGRITY_PAYLOAD_BYTES:
            raise serializers.ValidationError(
                "Serialized payload must not exceed 32 KiB."
            )
        return value

    def validate_evidence_descriptors(self, value):
        _validate_json_value(value)
        return value


class ExamIntegrityBatchSerializer(_StrictSerializer):
    strict_scalar_types = {
        "schema_version": (int,),
        "batch_id": (str,),
        "run_id": (str,),
        "participant_id": (int,),
        "device_id": (str,),
        "registry_version": (str,),
        "first_seq": (int,),
        "last_seq": (int,),
        "client_build": (str,),
    }

    schema_version = serializers.ChoiceField(choices=(1,))
    batch_id = serializers.UUIDField()
    run_id = serializers.UUIDField()
    participant_id = serializers.IntegerField(min_value=1)
    device_id = serializers.CharField(
        min_length=1,
        max_length=128,
        trim_whitespace=False,
    )
    registry_version = serializers.CharField(
        min_length=1,
        max_length=64,
        trim_whitespace=False,
    )
    first_seq = serializers.IntegerField(min_value=1)
    last_seq = serializers.IntegerField(min_value=1)
    records = ExamIntegrityRecordSerializer(
        many=True,
        min_length=1,
        max_length=200,
    )
    client_build = serializers.CharField(
        allow_blank=True,
        max_length=64,
        trim_whitespace=False,
    )

    def to_internal_value(self, data):
        if type(data) is dict and "records" in data and type(data["records"]) is not list:
            raise serializers.ValidationError(
                {"records": ["Expected a JSON array."]}
            )
        return super().to_internal_value(data)

    def validate(self, attrs):
        run = self.context["run"]
        participant = self.context["participant"]
        active_device_id = self.context.get("active_device_id")
        if (
            attrs["run_id"] != run.id
            or attrs["participant_id"] != participant.id
            or not isinstance(active_device_id, str)
            or attrs["device_id"] != active_device_id
        ):
            raise PermissionDenied("Batch identity does not match the active exam session.")

        records = attrs["records"]
        expected_seq = attrs["first_seq"]
        for record in records:
            if record["seq"] != expected_seq:
                raise serializers.ValidationError(
                    {
                        "records": [
                            "Records must exactly cover first_seq through last_seq."
                        ]
                    }
                )
            expected_seq += 1
        if records[-1]["seq"] != attrs["last_seq"]:
            raise serializers.ValidationError(
                {
                    "records": [
                        "Records must exactly cover first_seq through last_seq."
                    ]
                }
            )
        return attrs


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
