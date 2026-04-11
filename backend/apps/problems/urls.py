"""
URL configuration for problems app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProblemViewSet, TagViewSet

app_name = 'problems'

router = DefaultRouter()
router.register(r'tags', TagViewSet, basename='tag')
router.register(r'', ProblemViewSet, basename='problem')

urlpatterns = [
    path('', include(router.urls)),
]
