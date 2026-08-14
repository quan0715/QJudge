"""Compatibility routes for the AI Service-backed chat API."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .artifact_views import ArtifactViewSet
from .views import ChatRunViewSet, ModelListView, SessionViewSet


router = DefaultRouter()
router.register(r"sessions", SessionViewSet, basename="ai-session")
router.register(r"runs", ChatRunViewSet, basename="ai-run")
router.register(r"artifacts", ArtifactViewSet, basename="ai-artifact")

urlpatterns = [
    path("", include(router.urls)),
    path("models/", ModelListView.as_view(), name="ai-model-list"),
]
