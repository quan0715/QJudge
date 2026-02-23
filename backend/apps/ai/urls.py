"""AI Chat URL configuration."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AISessionViewSet

router = DefaultRouter()
router.register(r"sessions", AISessionViewSet, basename="ai-session")

urlpatterns = [
    path("", include(router.urls)),
]
