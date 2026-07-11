"""Public classroom service API.

The package keeps cross-domain workflow logic out of DRF views while preserving
the historical ``apps.classrooms.services`` import path.
"""

from .course_contests import (
    BoundClassroomContestResult,
    create_classroom_contest,
)
from .invite_codes import generate_invite_code
from .memberships import (
    AddMembersResult,
    add_classroom_members,
    remove_classroom_member,
    update_classroom_member_role,
)
from .participant_sync import on_member_joined, sync_classroom_participants

__all__ = [
    "AddMembersResult",
    "BoundClassroomContestResult",
    "add_classroom_members",
    "create_classroom_contest",
    "generate_invite_code",
    "on_member_joined",
    "remove_classroom_member",
    "sync_classroom_participants",
    "update_classroom_member_role",
]
