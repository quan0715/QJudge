from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AnnouncementViewSet

router = DefaultRouter()
router.register(r'', AnnouncementViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
