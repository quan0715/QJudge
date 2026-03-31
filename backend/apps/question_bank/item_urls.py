from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import QuestionBankItemViewSet

app_name = "question_bank_items"

router = DefaultRouter()
router.register(r"", QuestionBankItemViewSet, basename="question-bank-item")

urlpatterns = [
    path("", include(router.urls)),
]
