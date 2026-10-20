from __future__ import annotations

from typing import Optional

from django.contrib.auth import get_user_model
from django.db import models
from django.db.models import Count, Q

User = get_user_model()


def _classroom_manager_filter(user) -> Q:
    return Q(classroom_bindings__classroom__owner=user) | Q(
        classroom_bindings__classroom__memberships__user=user,
        classroom_bindings__classroom__memberships__role="ta",
    )


class ContestQuerySet(models.QuerySet):
    def optimized_for_list(self) -> "ContestQuerySet":
        return self.select_related("owner").annotate(participant_count=Count("participants"))

    def visible_to(self, *, user: Optional[User], scope: str = "visible") -> "ContestQuerySet":
        if scope == "manage":
            if not user or not user.is_authenticated:
                return self.none()
            if user.is_staff or user.is_superuser:
                return self
            return self.filter(_classroom_manager_filter(user)).distinct()

        if scope == "participated":
            if not user or not user.is_authenticated:
                return self.none()
            classroom_relation_filter = (
                Q(classroom_bindings__classroom__owner=user)
                | Q(classroom_bindings__classroom__memberships__user=user)
            )
            queryset = self.filter(registrations__user=user).filter(classroom_relation_filter)
            if not (user.is_staff or user.is_superuser):
                queryset = queryset.filter(~Q(status="draft") | _classroom_manager_filter(user))
            return queryset.distinct()

        queryset = self.filter(status="published")

        if not user or not user.is_authenticated:
            return queryset.none()

        classroom_relation_filter = (
            Q(classroom_bindings__classroom__owner=user)
            | Q(classroom_bindings__classroom__memberships__user=user)
        )
        return queryset.filter(classroom_relation_filter).distinct()
