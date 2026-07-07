"""Public classroom service API.

The package keeps cross-domain workflow logic out of DRF views while preserving
the historical ``apps.classrooms.services`` import path.
"""

from .course_contests import (
    BoundClassroomContestResult,
    accept_classroom_lab,
    bind_existing_contest,
    can_solve_classroom_lab,
    create_classroom_contest,
    create_classroom_lab,
    get_bound_lab,
    unbind_contest,
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
    "accept_classroom_lab",
    "add_classroom_members",
    "bind_existing_contest",
    "can_solve_classroom_lab",
    "create_classroom_contest",
    "create_classroom_lab",
    "generate_invite_code",
    "get_bound_lab",
    "on_member_joined",
    "remove_classroom_member",
    "sync_classroom_participants",
    "unbind_contest",
    "update_classroom_member_role",
]
