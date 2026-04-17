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
    # Existing session CRUD + actions (send_message_stream, rename, etc.)
    path("", include(router.urls)),

    # v2: Model list
    path("models/", ModelListView.as_view(), name="ai-model-list"),
]
