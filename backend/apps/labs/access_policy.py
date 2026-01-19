from __future__ import annotations

from dataclasses import dataclass

from django.utils import timezone

from apps.users.models import User
from .models import Lab


@dataclass(frozen=True)
class LabAccessError(Exception):
    message: str


class LabAccessPolicy:
    @staticmethod
    def is_manager(user: User, lab: Lab) -> bool:
        if user.is_staff:
            return True
        role = getattr(user, "role", "")
        if role == "admin":
            return True
        return lab.owner_id == user.id

    @classmethod
    def can_view(cls, user: User, lab: Lab) -> bool:
        if cls.is_manager(user, lab):
            return True
        return lab.is_published

    @classmethod
    def enforce_submission(cls, user: User, lab: Lab) -> bool:
        if cls.is_manager(user, lab):
            return True

        if not lab.is_published:
            raise LabAccessError("Lab is not published")

        if lab.due_at and timezone.now() > lab.due_at:
            raise LabAccessError("Lab due date has passed")

        return False
