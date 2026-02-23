"""AI Chat URL configuration."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AISessionViewSet,
    InternalCommitActionView,
    InternalPendingActionDetailView,
    InternalPrepareActionView,
    InternalProblemContextView,
    ModelListView,
)

router = DefaultRouter()
router.register(r"sessions", AISessionViewSet, basename="ai-session")

urlpatterns = [
    # Existing session CRUD + actions (send_message_stream, rename, etc.)
    path("", include(router.urls)),

    # v2: Model list
    path("models/", ModelListView.as_view(), name="ai-model-list"),

    # v2: Internal APIs (HMAC-protected, for ai-service)
    path(
        "internal/problem-actions/prepare",
        InternalPrepareActionView.as_view(),
        name="ai-internal-prepare",
    ),
    path(
        "internal/problem-actions/commit",
        InternalCommitActionView.as_view(),
        name="ai-internal-commit",
    ),
    path(
        "internal/pending-actions/<uuid:action_id>",
        InternalPendingActionDetailView.as_view(),
        name="ai-internal-pending-action-detail",
    ),
    path(
        "internal/problems/<int:problem_id>/context",
        InternalProblemContextView.as_view(),
        name="ai-internal-problem-context",
    ),
]
