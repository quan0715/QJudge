"""
URL configuration for submissions app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SubmissionViewSet

app_name = 'submissions'

router = DefaultRouter()
router.register(r'', SubmissionViewSet, basename='submission')

urlpatterns = [
    path('', include(router.urls)),
]
