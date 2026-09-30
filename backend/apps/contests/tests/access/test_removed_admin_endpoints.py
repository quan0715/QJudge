from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.contests.models import Contest
from apps.users.models import User


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "action"),
    [("get", "admins"), ("post", "add_admin"), ("post", "remove_admin")],
)
def test_contest_admin_endpoints_are_removed(method: str, action: str) -> None:
    owner = User.objects.create_user(
        username="removed_admin_owner",
        email="removed_admin_owner@example.com",
        password="pass",
        role="teacher",
    )
    contest = Contest.objects.create(
        name="No Co-admins",
        owner=owner,
        status="published",
        start_time=timezone.now() - timedelta(hours=1),
        end_time=timezone.now() + timedelta(hours=1),
    )
    client = APIClient()
    client.force_authenticate(user=owner)

    response = getattr(client, method)(f"/api/v1/contests/{contest.id}/{action}/")

    assert response.status_code == 404
