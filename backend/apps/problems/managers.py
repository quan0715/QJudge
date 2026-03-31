from __future__ import annotations

from typing import Iterable, Optional

from django.contrib.auth import get_user_model
from django.db import models
from django.db.models import Exists, OuterRef

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
                is_test=False,
            )
            queryset = queryset.annotate(is_solved=Exists(ac_submissions))

        if tag_slugs:
            for slug in tag_slugs:
                queryset = queryset.filter(tags__slug=slug)

        return queryset.prefetch_related("translations", "test_cases", "tags").distinct()


ProblemManager = ProblemQuerySet.as_manager
