"""
Tests for submissions app - filter functionality.
"""
import pytest
from rest_framework import status
from apps.submissions.models import Submission
from apps.problems.models import Problem


@pytest.fixture
def problem(user_factory):
    """Create a test problem."""
    owner = user_factory(username="problem-owner", email="problem@example.com")
    return Problem.objects.create(
        title="Test Problem",
        description="A test problem",
        created_by=owner,
        visibility="public",
    )


@pytest.fixture
def submission_factory(problem):
    """Factory for creating test submissions."""
    def create_submission(user, **kwargs):
        defaults = {
            "problem": problem,
            "user": user,
            "language": "python",
            "code": "print('hello')",
            "status": "AC",
            "source_type": "practice",
        }
        defaults.update(kwargs)
        return Submission.objects.create(**defaults)
    return create_submission


@pytest.mark.django_db
class TestSubmissionUserFilter:
    """Tests for filtering submissions by user."""

    def test_filter_submissions_by_user_id(
        self, api_client, user_factory, submission_factory
    ):
        """Test that submissions can be filtered by user ID."""
        # Create two users
        user1 = user_factory(username="user1", email="user1@example.com")
        user2 = user_factory(username="user2", email="user2@example.com")

        # Create submissions for each user
        sub1 = submission_factory(user1)
        sub2 = submission_factory(user1)
        sub3 = submission_factory(user2)

        # Authenticate as user1
        api_client.force_authenticate(user=user1)

        # Filter by user1's ID
        response = api_client.get(
            f"/api/v1/submissions/?source_type=practice&user={user1.id}"
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        results = data.get("results", data)

        # Should only get user1's submissions
        assert len(results) == 2
        submission_ids = [r["id"] for r in results]
        assert sub1.id in submission_ids
        assert sub2.id in submission_ids
        assert sub3.id not in submission_ids

    def test_filter_submissions_by_different_user(
        self, api_client, user_factory, submission_factory
    ):
        """Test filtering submissions by another user's ID."""
        user1 = user_factory(username="user1", email="user1@example.com")
        user2 = user_factory(username="user2", email="user2@example.com")

        # Create submissions
        submission_factory(user1)
        sub2 = submission_factory(user2)

        # Authenticate as user1 but filter by user2
        api_client.force_authenticate(user=user1)

        response = api_client.get(
            f"/api/v1/submissions/?source_type=practice&user={user2.id}"
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        results = data.get("results", data)

        # Should get user2's submission
        assert len(results) == 1
        assert results[0]["id"] == sub2.id

    def test_filter_without_user_returns_all_practice(
        self, api_client, user_factory, submission_factory
    ):
        """Test that not filtering by user returns all practice submissions."""
        user1 = user_factory(username="user1", email="user1@example.com")
        user2 = user_factory(username="user2", email="user2@example.com")

        # Create submissions
        submission_factory(user1)
        submission_factory(user2)

        api_client.force_authenticate(user=user1)

        response = api_client.get("/api/v1/submissions/?source_type=practice")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        results = data.get("results", data)

        # Should get all practice submissions
        assert len(results) == 2

    def test_filter_by_nonexistent_user(
        self, api_client, user_factory, submission_factory
    ):
        """Test filtering by a non-existent user ID returns empty results."""
        user1 = user_factory(username="user1", email="user1@example.com")
        submission_factory(user1)

        api_client.force_authenticate(user=user1)

        response = api_client.get(
            "/api/v1/submissions/?source_type=practice&user=99999"
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        results = data.get("results", data)

        # Should return empty
        assert len(results) == 0
