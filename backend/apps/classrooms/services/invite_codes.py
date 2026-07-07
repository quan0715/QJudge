"""Invite-code generation for classrooms."""

import secrets
import string

from apps.classrooms.models import Classroom


def generate_invite_code() -> str:
    """Generate a unique 8-character invite code."""
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(10):
        code = "".join(secrets.choice(alphabet) for _ in range(8))
        if not Classroom.objects.filter(invite_code=code).exists():
            return code
    raise RuntimeError("Failed to generate unique invite code after 10 attempts")
