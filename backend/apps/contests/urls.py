"""
URL configuration for contests app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_nested import routers
from .views import ContestViewSet, ContestQuestionViewSet, ContestAnnouncementViewSet

app_name = 'contests'

router = DefaultRouter()
router.register(r'', ContestViewSet, basename='contest')

# Nested router for contest questions and announcements
questions_router = routers.NestedSimpleRouter(router, r'', lookup='contest')
questions_router.register(r'questions', ContestQuestionViewSet, basename='contest-questions')
questions_router.register(r'announcements', ContestAnnouncementViewSet, basename='contest-announcements')

urlpatterns = [
    path('', include(router.urls)),
    path('', include(questions_router.urls)),
]
