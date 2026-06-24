from __future__ import annotations

from typing import Optional

from django.contrib.auth import get_user_model
from django.db import models
from django.db.models import Count, Q

User = get_user_model()


class ContestQuerySet(models.QuerySet):
    def optimized_for_list(self) -> "ContestQuerySet":
        return self.select_related("owner").annotate(participant_count=Count("participants"))

    def visible_to(self, *, user: Optional[User], scope: str = "visible") -> "ContestQuerySet":
        if scope == "manage":
            if not user or not user.is_authenticated:
                return self.none()
            if user.is_staff or getattr(user, "role", "") == "admin":
                return self
            classroom_manager_filter = (
                Q(classroom_bindings__classroom__owner=user)
                | Q(classroom_bindings__classroom__admins=user)
                | Q(
                    classroom_bindings__classroom__memberships__user=user,
                    classroom_bindings__classroom__memberships__role="ta",
                )
            )
            return self.filter(
                Q(owner=user) | Q(admins=user) | classroom_manager_filter
            ).distinct()

        if scope == "participated":
            if not user or not user.is_authenticated:
                return self.none()
            queryset = self.filter(registrations__user=user).distinct()
            if not (user.is_staff or getattr(user, "role", "") in ["admin", "teacher"]):
                queryset = queryset.exclude(status="draft")
            return queryset

        queryset = self.filter(status="published")

        if not user or not user.is_authenticated:
            return queryset.none()

        relation_filter = (
            Q(registrations__user=user)
            | Q(classroom_bindings__classroom__owner=user)
            | Q(classroom_bindings__classroom__admins=user)
            | Q(classroom_bindings__classroom__memberships__user=user)
            | Q(owner=user)
            | Q(admins=user)
        )
        return (
            queryset.filter(relation_filter)
            .filter(visibility__in=["public", "private"])
            .distinct()
        )
