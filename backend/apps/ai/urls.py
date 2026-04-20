"""AI Chat URL configuration."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .artifact_views import AIArtifactInternalViewSet, AIArtifactUserViewSet
from .views import (
    AIChatRunViewSet,
    AISessionViewSet,
    ModelListView,
)

router = DefaultRouter()
router.register(r"sessions", AISessionViewSet, basename="ai-session")
router.register(r"runs", AIChatRunViewSet, basename="ai-run")
router.register(r"artifacts", AIArtifactUserViewSet, basename="ai-artifact")

internal_router = DefaultRouter()
internal_router.register(
    r"artifacts", AIArtifactInternalViewSet, basename="ai-artifact-internal"
)

urlpatterns = [
    # Session CRUD and durable run APIs.
    path("", include(router.urls)),

    path("models/", ModelListView.as_view(), name="ai-model-list"),

    # Internal ai-service endpoints (HMAC via X-AI-Internal-Token).
    path("_internal/", include(internal_router.urls)),
]
