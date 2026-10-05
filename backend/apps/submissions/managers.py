from __future__ import annotations

from datetime import timedelta
from typing import Optional

from django.contrib.auth import get_user_model
from django.db import models
from django.utils import timezone

User = get_user_model()


class SubmissionQuerySet(models.QuerySet):
    def optimized_for_detail(self) -> "SubmissionQuerySet":
        return self.select_related("user", "problem", "contest")

    def optimized_for_list(self) -> "SubmissionQuerySet":
        return self.only(
            "id",
            "user_id",
            "problem_id",
            "contest_id",
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
            "problem__question_asset__title",
            "contest__id",
        ).select_related("user", "problem", "problem__question_asset", "contest")

    def visible_to(
        self,
        *,
        user: Optional[User],
        source_type: str,
        contest_id: Optional[str],
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

        if not include_all:
            if created_after:
                queryset = queryset.filter(created_at__gte=created_after)
            else:
                cutoff_date = timezone.now() - timedelta(days=date_range_days)
                queryset = queryset.filter(created_at__gte=cutoff_date)

        if source_type == "practice":
            queryset = queryset.filter(source_type="practice", is_test=False)
            if is_privileged_user:
                return queryset
            if user and user.is_authenticated:
                return queryset.filter(user=user)
            return queryset.none()

        if source_type == "contest":
            from apps.contests.models import Contest

            if not user or not user.is_authenticated:
                return queryset.none()
            queryset = queryset.filter(source_type="contest")
            if contest_id:
                queryset = queryset.filter(contest_id=contest_id)
            managed = Contest.objects.visible_to(user=user, scope="manage")
            visible = Contest.objects.visible_to(user=user)
            return queryset.filter(
                models.Q(contest__in=managed)
                | (models.Q(contest__in=visible) & (
                    models.Q(user=user)
                    | models.Q(contest__scoreboard_visible_during_contest=True)
                    | models.Q(contest__end_time__lt=timezone.now())
                ))
            )

        if user and user.is_authenticated:
            return queryset.filter(user=user)

        return queryset.none()


SubmissionManager = SubmissionQuerySet.as_manager
