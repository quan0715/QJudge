from __future__ import annotations

from datetime import timedelta
from typing import Optional

from django.contrib.auth import get_user_model
from django.db import models
from django.db.models import OuterRef, Subquery
from django.utils import timezone

from apps.contests.models import ContestParticipant

User = get_user_model()


class SubmissionQuerySet(models.QuerySet):
    def optimized_for_detail(self) -> "SubmissionQuerySet":
        return self.select_related("user", "problem", "contest", "lab")

    def optimized_for_list(self) -> "SubmissionQuerySet":
        return self.only(
            "id",
            "user_id",
            "problem_id",
            "contest_id",
            "lab_id",
            "source_type",
            "language",
            "status",
            "score",
            "exec_time",
            "memory_usage",
            "created_at",
            "user__id",
            "user__username",
            "problem__id",
            "problem__title",
            "contest__id",
            "contest__anonymous_mode_enabled",
            "lab__id",
        ).select_related("user", "problem", "contest", "lab")

    def visible_to(
        self,
        *,
        user: Optional[User],
        source_type: str,
        contest_id: Optional[int],
        lab_id: Optional[int],
        include_all: bool,
        created_after: Optional[str],
        date_range_days: int,
    ) -> "SubmissionQuerySet":
        queryset = self.optimized_for_list()
        is_privileged_user = bool(
            user
            and user.is_authenticated
            and (user.is_staff or getattr(user, "role", "") in ["admin", "teacher"])
        )

        if contest_id:
            nickname_subquery = ContestParticipant.objects.filter(
                contest_id=contest_id,
                user_id=OuterRef("user_id"),
            ).values("nickname")[:1]
            queryset = queryset.annotate(_contest_nickname=Subquery(nickname_subquery))

        if not include_all:
            if created_after:
                queryset = queryset.filter(created_at__gte=created_after)
            else:
                cutoff_date = timezone.now() - timedelta(days=date_range_days)
                queryset = queryset.filter(created_at__gte=cutoff_date)

        if source_type == "practice":
            queryset = queryset.filter(source_type="practice", is_test=False)
            if lab_id:
                queryset = queryset.filter(lab_id=lab_id)
            if is_privileged_user:
                return queryset
            if user and user.is_authenticated:
                return queryset.filter(user=user)
            return queryset.none()

        if source_type == "contest":
            queryset = queryset.filter(source_type="contest")
            if contest_id:
                return queryset.filter(contest_id=contest_id)
            if is_privileged_user:
                return queryset
            return queryset.none()

        if user and user.is_authenticated:
            return queryset.filter(user=user)

        return queryset.none()


SubmissionManager = SubmissionQuerySet.as_manager
