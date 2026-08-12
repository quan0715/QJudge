import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.users.models import User


@pytest.mark.django_db
def test_global_announcement_api_is_removed() -> None:
    admin = User.objects.create_superuser(
        username="retired-announcement-admin",
        email="retired-announcement-admin@example.com",
        password="pass123",
        role="admin",
    )
    client = APIClient()
    client.force_authenticate(admin)

    response = client.get("/api/v1/management/announcements/")

    assert response.status_code == 404


@pytest.mark.django_db(transaction=True)
def test_only_scoped_announcement_tables_remain() -> None:
    table_names = set(connection.introspection.table_names())

    assert "announcements_announcement" not in table_names
    assert "classrooms_classroomannouncement" in table_names
    assert "contest_announcements" in table_names
