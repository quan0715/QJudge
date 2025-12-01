from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_nested import routers
from .views import (
    ContestViewSet,
    ContestAnnouncementViewSet,
    ClarificationViewSet,
    ExamViewSet,
    ContestProblemViewSet,
    ContestActivityViewSet
)
from apps.submissions.views import SubmissionViewSet

app_name = 'contests'

router = DefaultRouter()
router.register(r'', ContestViewSet, basename='contest')

# Nested router for contest sub-resources
contest_router = routers.NestedSimpleRouter(router, r'', lookup='contest')
contest_router.register(r'announcements', ContestAnnouncementViewSet, basename='contest-announcements')
contest_router.register(r'clarifications', ClarificationViewSet, basename='contest-clarifications')
contest_router.register(r'exam', ExamViewSet, basename='contest-exam')
contest_router.register(r'problems', ContestProblemViewSet, basename='contest-problems')
contest_router.register(r'submissions', SubmissionViewSet, basename='contest-submissions')
contest_router.register(r'activities', ContestActivityViewSet, basename='contest-activities')

urlpatterns = [
    path('', include(router.urls)),
    path('', include(contest_router.urls)),
]
