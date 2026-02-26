from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ClassroomViewSet

app_name = 'classrooms'

router = DefaultRouter()
router.register(r'', ClassroomViewSet, basename='classroom')

urlpatterns = [
    path('', include(router.urls)),
]
