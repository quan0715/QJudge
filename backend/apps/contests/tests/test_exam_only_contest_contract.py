from __future__ import annotations

from apps.contests.models import Contest, ContestParticipant
from apps.contests.serializers import (
    ContestCreateUpdateSerializer,
    ContestDetailSerializer,
    ContestListSerializer,
)


REMOVED_CONTEST_FIELDS = {
    "delivery_mode",
    "counts_toward_grade",
    "max_cheat_warnings",
}
REMOVED_PARTICIPANT_FIELDS = {
    "assignment_state",
    "accepted_at",
    "submitted_at",
}


def test_exam_only_models_drop_retired_fields() -> None:
    contest_fields = {field.name for field in Contest._meta.get_fields()}
    participant_fields = {field.name for field in ContestParticipant._meta.get_fields()}

    assert REMOVED_CONTEST_FIELDS.isdisjoint(contest_fields)
    assert REMOVED_PARTICIPANT_FIELDS.isdisjoint(participant_fields)


def test_contest_serializers_drop_retired_fields() -> None:
    serializer_classes = (
        ContestListSerializer,
        ContestDetailSerializer,
        ContestCreateUpdateSerializer,
    )

    for serializer_class in serializer_classes:
        serializer_fields = set(serializer_class.Meta.fields)
        assert REMOVED_CONTEST_FIELDS.isdisjoint(serializer_fields)
        assert REMOVED_PARTICIPANT_FIELDS.isdisjoint(serializer_fields)
