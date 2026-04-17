"""AI Chat URL configuration."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AIChatRunViewSet,
    AISessionViewSet,
    ModelListView,
)

router = DefaultRouter()
router.register(r"sessions", AISessionViewSet, basename="ai-session")
router.register(r"runs", AIChatRunViewSet, basename="ai-run")

urlpatterns = [
    # Session CRUD and durable run APIs.
    path("", include(router.urls)),

    path("models/", ModelListView.as_view(), name="ai-model-list"),
]
