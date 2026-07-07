"""Classroom membership workflows."""

from __future__ import annotations

from dataclasses import dataclass

from django.contrib.auth import get_user_model
from django.db import models

from apps.classrooms.models import Classroom, ClassroomMember

from .participant_sync import on_member_joined

User = get_user_model()


@dataclass(frozen=True)
class AddMembersResult:
    added: list[str]
    already_exists: list[str]
    not_found: list[str]


def _reserved_user_ids(classroom: Classroom) -> set[int]:
    admin_user_ids = set(classroom.admins.values_list("id", flat=True))
    return admin_user_ids | {classroom.owner_id}


def _resolve_users(identifiers: list[str]) -> tuple[list[User], list[str]]:
    users_by_key: dict[str, User] = {}
    email_identifiers = [value.lower() for value in identifiers if "@" in value]
    for user in User.objects.filter(
        models.Q(username__in=identifiers) | models.Q(email__in=email_identifiers)
    ):
        users_by_key.setdefault(user.username, user)
        users_by_key.setdefault(user.email.lower(), user)

    resolved_users: list[User] = []
    seen_user_ids: set[int] = set()
    not_found: list[str] = []
    for raw_identifier in identifiers:
        lookup_key = raw_identifier.lower() if "@" in raw_identifier else raw_identifier
        user = users_by_key.get(lookup_key)
        if user is None:
            not_found.append(raw_identifier)
            continue
        if user.id in seen_user_ids:
            continue
        seen_user_ids.add(user.id)
        resolved_users.append(user)
    return resolved_users, not_found


def add_classroom_members(
    classroom: Classroom,
    *,
    identifiers: list[str],
    role: str,
) -> AddMembersResult:
    resolved_users, not_found = _resolve_users(identifiers)

    added: list[str] = []
    already_exists: list[str] = []
    reserved_user_ids = _reserved_user_ids(classroom)
    for user in resolved_users:
        if user.id in reserved_user_ids:
            already_exists.append(user.username)
            continue
        _, created = ClassroomMember.objects.get_or_create(
            classroom=classroom,
            user=user,
            defaults={"role": role},
        )
        if created:
            added.append(user.username)
            on_member_joined(classroom, user)
        else:
            already_exists.append(user.username)

    return AddMembersResult(
        added=added,
        already_exists=already_exists,
        not_found=not_found,
    )


def remove_classroom_member(classroom: Classroom, *, user_id: int) -> bool:
    deleted, _ = ClassroomMember.objects.filter(
        classroom=classroom,
        user_id=user_id,
    ).delete()
    return deleted > 0


def update_classroom_member_role(
    classroom: Classroom,
    *,
    user_id: int,
    role: str,
) -> bool:
    updated = ClassroomMember.objects.filter(
        classroom=classroom,
        user_id=user_id,
    ).update(role=role)
    return updated > 0
