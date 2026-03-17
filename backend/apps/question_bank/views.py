"""
Views for question bank API.
"""
from django.db.models import Q
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import QuestionBank, Question
from .serializers import (
    ExploreBankItemSerializer,
    QuestionBankSerializer,
    QuestionCloneSerializer,
    QuestionInboxIngestSerializer,
    QuestionInboxItemSerializer,
    QuestionSerializer,
)
from .services import (
    PLATFORM_BANK_FILTER,
    clone_question_to_bank,
    get_or_create_personal_bank,
    ingest_question_bank_inbox_items,
    is_platform_public_bank,
    list_question_bank_inbox,
)


class QuestionBankViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = QuestionBankSerializer
    pagination_class = None
    lookup_field = "uuid"

    def get_queryset(self):
        if self.action == "explore":
            return (
                QuestionBank.objects.filter(
                    is_archived=False,
                    visibility=QuestionBank.Visibility.PUBLIC,
                    verified=True,
                )
                .filter(PLATFORM_BANK_FILTER)
                .prefetch_related("questions")
            )

        return (
            QuestionBank.objects.filter(
                owner=self.request.user,
                is_archived=False,
            )
            .prefetch_related("questions")
            .order_by("-updated_at", "id")
        )

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def perform_destroy(self, instance):
        instance.is_archived = True
        instance.save(update_fields=["is_archived", "updated_at"])

    @action(detail=False, methods=["get"], url_path="explore")
    def explore(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = ExploreBankItemSerializer(queryset, many=True)
        return Response({
            "count": len(serializer.data),
            "results": serializer.data,
        })

    @action(detail=False, methods=["get"], url_path="inbox")
    def inbox(self, request):
        category = request.query_params.get("category")
        if category not in (None, "", "coding", "exam"):
            return Response(
                {"detail": "Invalid category. Use coding or exam."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        normalized_category = category or None
        payload = list_question_bank_inbox(request.user, normalized_category)
        coding_serialized = QuestionInboxItemSerializer(payload.get("coding", []), many=True).data
        exam_serialized = QuestionInboxItemSerializer(payload.get("exam", []), many=True).data
        return Response(
            {
                "coding": coding_serialized,
                "exam": exam_serialized,
                "counts": {
                    "coding": len(coding_serialized),
                    "exam": len(exam_serialized),
                },
            }
        )

    @action(detail=False, methods=["post"], url_path="inbox/ingest")
    def ingest_inbox(self, request):
        serializer = QuestionInboxIngestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            result = ingest_question_bank_inbox_items(
                user=request.user,
                target_bank_uuid=data["target_bank_id"],
                items=data["items"],
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get", "post"], url_path="questions")
    def questions(self, request, uuid=None, pk=None):
        bank = self.get_object()

        if request.method.lower() == "get":
            serializer = QuestionSerializer(bank.questions.order_by("order", "id"), many=True)
            return Response(serializer.data)

        serializer = QuestionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        question = serializer.save(bank=bank, created_by=request.user)
        return Response(QuestionSerializer(question).data, status=status.HTTP_201_CREATED)


class QuestionViewSet(
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = QuestionSerializer

    def get_queryset(self):
        user = self.request.user
        base = Question.objects.select_related("bank", "bank__owner", "created_by")

        if self.action == "clone_to_my_bank":
            return base.filter(
                Q(bank__owner=user, bank__is_archived=False)
                | Q(
                    bank__is_archived=False,
                    bank__visibility=QuestionBank.Visibility.PUBLIC,
                    bank__verified=True,
                )
            ).filter(
                Q(bank__owner=user)
                | Q(bank__owner__isnull=True)
                | Q(bank__owner__is_staff=True)
                | Q(bank__owner__role="admin")
            )

        return base.filter(bank__owner=user, bank__is_archived=False)

    @action(detail=True, methods=["post"], url_path="clone-to-my-bank")
    def clone_to_my_bank(self, request, pk=None):
        source_question = self.get_object()

        if source_question.bank.owner_id != request.user.id and not is_platform_public_bank(source_question.bank):
            return Response({"detail": "Question is not cloneable."}, status=status.HTTP_403_FORBIDDEN)

        payload = QuestionCloneSerializer(data=request.data or {})
        payload.is_valid(raise_exception=True)
        target_bank_id = payload.validated_data.get("target_bank_id")

        try:
            target_bank = get_or_create_personal_bank(
                user=request.user,
                category=source_question.bank.category,
                target_bank_uuid=target_bank_id,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        cloned = clone_question_to_bank(source_question, target_bank, request.user)
        return Response(QuestionSerializer(cloned).data, status=status.HTTP_201_CREATED)
