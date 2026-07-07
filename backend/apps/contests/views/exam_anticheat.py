"""ExamAnticheatMixin — shared active-device guard for exam actions."""

from ..services.anti_cheat_session import (
    get_device_id,
    set_active_session,
)
from .exam_validation_response import (
    build_device_conflict_response_for_view,
)


class ExamAnticheatMixin:
    """Mixin for validating and refreshing the active exam device session."""

    def _ensure_active_device_session(self, contest, participant, request):
        """Delegate to the shared helper, then refresh the active session."""
        conflict_response = build_device_conflict_response_for_view(contest, participant, request)
        if conflict_response is not None:
            return conflict_response
        set_active_session(contest, participant, request, get_device_id(request))
        return None
