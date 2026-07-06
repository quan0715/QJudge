"""Contest activity logging service."""
from __future__ import annotations

import logging

from apps.contests.models import ContestActivity

logger = logging.getLogger(__name__)


def log_contest_activity(contest, user, action_type: str, details: str = "") -> ContestActivity | None:
    """Create a contest activity row without failing the primary workflow."""
    try:
        return ContestActivity.objects.create(
            contest=contest,
            user=user,
            action_type=action_type,
            details=details,
        )
    except Exception:
        logger.debug("Failed to log contest activity", exc_info=True)
        return None
