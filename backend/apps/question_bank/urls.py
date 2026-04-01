from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import QuestionBankViewSet

app_name = "question_bank"

router = DefaultRouter()
router.register(r"", QuestionBankViewSet, basename="question-bank")

urlpatterns = [
    path("", include(router.urls)),
]
