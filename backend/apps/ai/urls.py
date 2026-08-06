"""Compatibility routes for the AI Service-backed chat API."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .artifact_views import AIArtifactUserViewSet
from .views import AIChatRunViewSet, AISessionViewSet, ModelListView, UsageView


router = DefaultRouter()
router.register(r"sessions", AISessionViewSet, basename="ai-session")
router.register(r"runs", AIChatRunViewSet, basename="ai-run")
router.register(r"artifacts", AIArtifactUserViewSet, basename="ai-artifact")

urlpatterns = [
    path("", include(router.urls)),
    path("models/", ModelListView.as_view(), name="ai-model-list"),
    path("usage/", UsageView.as_view(), name="ai-usage"),
]
