from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import QuestionViewSet

app_name = "question_bank_questions"

router = DefaultRouter()
router.register(r"", QuestionViewSet, basename="question")

urlpatterns = [
    path("", include(router.urls)),
]
