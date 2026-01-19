from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import LabViewSet

app_name = "labs"

router = DefaultRouter()
router.register(r"", LabViewSet, basename="lab")

urlpatterns = [
    path("", include(router.urls)),
]
