from __future__ import annotations

from typing import Iterable, Optional

from django.contrib.auth import get_user_model
from django.db import models
from django.db.models import Case, Count, Exists, F, FloatField, OuterRef, Q, Value, When
from django.db.models.functions import Cast

User = get_user_model()


class ProblemQuerySet(models.QuerySet):
    def visible_to(
        self,
        *,
        user: Optional[User],
        scope: Optional[str],
        action: Optional[str],
        tag_slugs: Optional[Iterable[str]] = None,
    ) -> "ProblemQuerySet":
        if not user or not user.is_authenticated:
            return self.none()

        if user.is_staff or getattr(user, "role", "") == "admin":
            queryset = self
        elif getattr(user, "role", "") == "teacher":
            queryset = self.filter(created_by=user)
        else:
            return self.none()

        if user and user.is_authenticated:
            from apps.submissions.models import Submission

            ac_submissions = Submission.objects.filter(
                problem=OuterRef("pk"),
                user=user,
                status="AC",
            )
            queryset = queryset.annotate(is_solved=Exists(ac_submissions))

        if tag_slugs:
            for slug in tag_slugs:
                queryset = queryset.filter(tags__slug=slug)

        return (
            queryset.select_related("question_asset", "created_by")
            .prefetch_related("test_cases", "tags", "language_configs")
            .distinct()
        )

    def with_submission_stats(self) -> "ProblemQuerySet":
        """Annotate submission totals across all contests, computed at read time."""
        return self.annotate(
            submission_count=Count("submissions", distinct=True),
            accepted_count=Count("submissions", filter=Q(submissions__status="AC"), distinct=True),
        ).annotate(
            acceptance_rate=Case(
                When(submission_count=0, then=Value(0.0)),
                default=Cast(F("accepted_count"), FloatField()) * 100 / F("submission_count"),
                output_field=FloatField(),
            )
        )


ProblemManager = ProblemQuerySet.as_manager
