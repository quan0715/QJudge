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
            return self.filter(Q(owner=user) | Q(admins=user)).distinct()

        if scope == "participated":
            if not user or not user.is_authenticated:
                return self.none()
            queryset = self.filter(registrations__user=user).distinct()
            if not (user.is_staff or getattr(user, "role", "") in ["admin", "teacher"]):
                queryset = queryset.exclude(status="draft")
            return queryset

        queryset = self.filter(status="published")

        if user and user.is_authenticated:
            return queryset.filter(visibility__in=["public", "private"])

        return queryset.filter(visibility="public")

