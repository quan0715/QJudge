import pytest
from rest_framework import status
from apps.contests.models import Contest


@pytest.mark.django_db
def test_authenticated_user_can_create_contest(authenticated_client):
    client, user = authenticated_client

    response = client.post(
        "/api/v1/contests/",
        {"name": "Weekly Contest", "visibility": "public"},
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    contest = Contest.objects.get(id=response.json()["id"])
    assert contest.owner == user
    assert contest.status == "draft"


@pytest.mark.django_db
def test_unauthenticated_user_cannot_create_contest(api_client):
    response = api_client.post(
        "/api/v1/contests/",
        {"name": "Unauthorized Contest"},
        format="json",
    )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_owner_can_update_contest(api_client, user_factory):
    owner = user_factory(username="contest-owner", email="owner@example.com")
    api_client.force_authenticate(user=owner)

    create_response = api_client.post(
        "/api/v1/contests/",
        {"name": "Initial Name"},
        format="json",
    )
    contest_id = create_response.json()["id"]

    update_response = api_client.patch(
        f"/api/v1/contests/{contest_id}/",
        {"name": "Updated Contest"},
        format="json",
    )

    assert update_response.status_code == status.HTTP_200_OK
    contest = Contest.objects.get(id=contest_id)
    assert contest.name == "Updated Contest"
    assert contest.owner == owner
