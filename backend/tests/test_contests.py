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


@pytest.mark.django_db
def test_create_contest_defaults_to_coding_type(authenticated_client):
    """New contests default to contest_type='coding'."""
    client, _ = authenticated_client

    response = client.post(
        "/api/v1/contests/",
        {"name": "Coding Contest"},
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    contest = Contest.objects.get(id=response.json()["id"])
    assert contest.contest_type == "coding"
    assert contest.cheat_detection_enabled is False


@pytest.mark.django_db
def test_create_paper_exam_contest(authenticated_client):
    """Can create a paper_exam contest with cheat detection enabled."""
    client, _ = authenticated_client

    response = client.post(
        "/api/v1/contests/",
        {
            "name": "OS Midterm",
            "contest_type": "paper_exam",
            "cheat_detection_enabled": True,
        },
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    contest = Contest.objects.get(id=response.json()["id"])
    assert contest.contest_type == "paper_exam"
    assert contest.cheat_detection_enabled is True


@pytest.mark.django_db
def test_contest_detail_includes_contest_type(api_client, user_factory):
    """GET contest detail returns contest_type and cheat_detection_enabled."""
    owner = user_factory(username="detail-owner", email="detail@example.com")
    api_client.force_authenticate(user=owner)

    create_resp = api_client.post(
        "/api/v1/contests/",
        {"name": "Detail Test", "contest_type": "paper_exam"},
        format="json",
    )
    contest_id = create_resp.json()["id"]

    detail_resp = api_client.get(f"/api/v1/contests/{contest_id}/")
    assert detail_resp.status_code == status.HTTP_200_OK
    data = detail_resp.json()
    assert data["contest_type"] == "paper_exam"
    assert "cheat_detection_enabled" in data


@pytest.mark.django_db
def test_update_contest_type(api_client, user_factory):
    """Can update contest_type via PATCH."""
    owner = user_factory(username="type-update", email="type@example.com")
    api_client.force_authenticate(user=owner)

    create_resp = api_client.post(
        "/api/v1/contests/",
        {"name": "Type Change"},
        format="json",
    )
    contest_id = create_resp.json()["id"]

    update_resp = api_client.patch(
        f"/api/v1/contests/{contest_id}/",
        {"contest_type": "paper_exam"},
        format="json",
    )
    assert update_resp.status_code == status.HTTP_200_OK

    contest = Contest.objects.get(id=contest_id)
    assert contest.contest_type == "paper_exam"
