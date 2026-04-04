"""
Views for question bank API.
"""
from io import BytesIO

from PIL import Image, UnidentifiedImageError
from django.conf import settings
from django.http import Http404
from django.db.models import Count, Q
from django.urls import reverse
from django.utils import timezone
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.core.services import (
    MarkdownImageStorageError,
    build_markdown_image_object_key,
    store_markdown_image,
)

from apps.contests.models import ExamQuestion

from .models import QuestionBank, Question, QuestionBankMembership
from .read_models import (
    build_read_row_for_membership,
    build_read_row_for_question,
    get_bank_for_read,
    get_bank_questions_payload,
    resolve_bank_question_target_for_user,
)
from .serializers import (
    ExploreBankItemSerializer,
    QuestionBankSerializer,
    QuestionBankItemReadSerializer,
    QuestionCloneSerializer,
    QuestionInboxIngestSerializer,
    QuestionInboxItemSerializer,
    QuestionBankItemWriteSerializer,
)
from .permissions import IsQuestionBankAdminReviewer, IsQuestionBankOwner
from .write_workflows import create_bank_question, update_bank_question
from .write_workflows import materialize_bank_question_adapter_for_membership
from .bank_workflows import (
    clone_question_to_bank,
    get_or_create_personal_bank,
    ingest_question_bank_inbox_items,
    is_publicly_accessible_bank,
    list_question_bank_inbox,
)


def _serialize_bank_question_response(*, question=None, membership=None):
    if membership is None and question is not None:
        membership = (
            QuestionBankMembership.objects.select_related(
                "bank",
                "question_asset",
                "question_asset__latest_version",
                "added_by",
                "legacy_question",
                "legacy_question__coding_ext",
                "legacy_question__source_bank",
                "legacy_question__created_by",
                "legacy_question__question_version",
            )
            .filter(legacy_question=question)
            .first()
        )
    if membership is not None:
        return QuestionBankItemReadSerializer(build_read_row_for_membership(membership=membership)).data
    if question is not None:
        return QuestionBankItemReadSerializer(build_read_row_for_question(question=question)).data
    raise Http404


class QuestionBankViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = QuestionBankSerializer
    pagination_class = None
    lookup_field = "uuid"
    COVER_SUPPORTED_FORMATS = {
        "PNG": ("png", "image/png"),
        "JPEG": ("jpg", "image/jpeg"),
        "WEBP": ("webp", "image/webp"),
    }

    @staticmethod
    def _is_admin_user(user) -> bool:
        return bool(user and (user.is_staff or getattr(user, "role", None) == "admin"))

    def get_queryset(self):
        if self.action == "explore":
            return (
                QuestionBank.objects.filter(
                    is_archived=False,
                    visibility=QuestionBank.Visibility.PUBLIC,
                    verified=True,
                    review_status=QuestionBank.ReviewStatus.APPROVED,
                )
                .annotate(question_count=Count("questions", distinct=True))
            )

        if self.action == "retrieve":
            visibility_filter = Q(
                is_archived=False,
                visibility=QuestionBank.Visibility.PUBLIC,
                verified=True,
                review_status=QuestionBank.ReviewStatus.APPROVED,
            )
            if self._is_admin_user(self.request.user):
                return (
                    QuestionBank.objects.filter(is_archived=False)
                    .annotate(question_count=Count("questions", distinct=True))
                )
            return (
                QuestionBank.objects.filter(
                    Q(owner=self.request.user, is_archived=False)
                    | visibility_filter
                )
                .annotate(question_count=Count("questions", distinct=True))
            )

        if self.action == "review_queue":
            if not self._is_admin_user(self.request.user):
                return QuestionBank.objects.none()
            return (
                QuestionBank.objects.filter(
                    is_archived=False,
                    review_status=QuestionBank.ReviewStatus.PENDING,
                )
                .annotate(question_count=Count("questions", distinct=True))
                .order_by("submitted_at", "-updated_at")
            )

        if self.action == "submit_for_review":
            return (
                QuestionBank.objects.filter(is_archived=False)
                .annotate(question_count=Count("questions", distinct=True))
            )
        if self.action == "review":
            return QuestionBank.objects.filter(is_archived=False)

        return (
            QuestionBank.objects.filter(
                owner=self.request.user,
                is_archived=False,
            )
            .annotate(question_count=Count("questions", distinct=True))
            .order_by("-updated_at", "id")
        )

    def get_permissions(self):
        if self.action == "review":
            return [permissions.IsAuthenticated(), IsQuestionBankAdminReviewer()]
        if self.action == "submit_for_review":
            return [permissions.IsAuthenticated(), IsQuestionBankOwner()]
        if self.action == "questions" and self.request.method.lower() == "post":
            return [permissions.IsAuthenticated(), IsQuestionBankOwner()]
        return super().get_permissions()

    def perform_create(self, serializer):
        user = self.request.user
        if not (user.is_staff or getattr(user, "role", None) in ("teacher", "admin")):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only teachers and admins can create question banks.")
        serializer.save(owner=user)

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

    @action(detail=False, methods=["get"], url_path="review-queue")
    def review_queue(self, request):
        if not self._is_admin_user(request.user):
            return Response({"detail": "Admin only."}, status=status.HTTP_403_FORBIDDEN)
        queryset = self.filter_queryset(self.get_queryset())
        serializer = QuestionBankSerializer(queryset, many=True)
        return Response({"count": len(serializer.data), "results": serializer.data})

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

    @action(
        detail=True,
        methods=["post"],
        url_path="upload_cover",
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload_cover(self, request, uuid=None, pk=None):
        bank = self.get_object()

        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response({"error": "file is required"}, status=status.HTTP_400_BAD_REQUEST)

        max_bytes = int(getattr(settings, "MARKDOWN_IMAGE_MAX_BYTES", 5242880))
        if uploaded.size > max_bytes:
            return Response(
                {"error": f"File is too large (max {max_bytes // 1048576}MB)"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = uploaded.read()
        if not payload:
            return Response({"error": "Uploaded file is empty"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with Image.open(BytesIO(payload)) as img:
                img.verify()
            with Image.open(BytesIO(payload)) as img:
                image_format = (img.format or "").upper()
        except (UnidentifiedImageError, OSError):
            return Response({"error": "Unsupported image file"}, status=status.HTTP_400_BAD_REQUEST)

        if image_format not in self.COVER_SUPPORTED_FORMATS:
            return Response(
                {"error": "Unsupported format. Use png/jpg/webp"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        extension, content_type = self.COVER_SUPPORTED_FORMATS[image_format]
        object_key = build_markdown_image_object_key(extension)

        try:
            store_markdown_image(content=payload, object_key=object_key, content_type=content_type)
        except MarkdownImageStorageError:
            return Response({"error": "Failed to upload image"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        base_url = (getattr(settings, "MARKDOWN_IMAGE_PUBLIC_BASE_URL", "") or "").strip()
        path = reverse("markdown-image-read", kwargs={"object_key": object_key})
        image_url = f"{base_url.rstrip('/')}{path}" if base_url else request.build_absolute_uri(path)

        bank.cover_url = image_url
        bank.save(update_fields=["cover_url", "updated_at"])

        return Response({"cover_url": image_url}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="submit-for-review")
    def submit_for_review(self, request, uuid=None, pk=None):
        bank = self.get_object()
        self.check_object_permissions(request, bank)
        if bank.review_status == QuestionBank.ReviewStatus.PENDING:
            return Response({"detail": "This bank is already pending review."}, status=status.HTTP_400_BAD_REQUEST)
        if not bank.questions.exists():
            return Response({"detail": "Please add at least one question before submission."}, status=status.HTTP_400_BAD_REQUEST)

        bank.review_status = QuestionBank.ReviewStatus.PENDING
        bank.review_note = ""
        bank.submitted_at = timezone.now()
        bank.reviewed_at = None
        bank.reviewed_by = None
        bank.verified = False
        bank.visibility = QuestionBank.Visibility.PUBLIC
        bank.save(
            update_fields=[
                "review_status",
                "review_note",
                "submitted_at",
                "reviewed_at",
                "reviewed_by",
                "verified",
                "visibility",
                "updated_at",
            ]
        )
        return Response(QuestionBankSerializer(bank).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="review")
    def review(self, request, uuid=None, pk=None):
        bank = self.get_object()
        self.check_object_permissions(request, bank)

        decision = str(request.data.get("decision", "")).strip().lower()
        note = str(request.data.get("note", "")).strip()
        if decision not in {"approve", "reject"}:
            return Response({"detail": "decision must be approve or reject"}, status=status.HTTP_400_BAD_REQUEST)
        if bank.review_status != QuestionBank.ReviewStatus.PENDING:
            return Response({"detail": "Bank is not pending review."}, status=status.HTTP_400_BAD_REQUEST)

        if decision == "approve":
            bank.review_status = QuestionBank.ReviewStatus.APPROVED
            bank.verified = True
            bank.visibility = QuestionBank.Visibility.PUBLIC
        else:
            bank.review_status = QuestionBank.ReviewStatus.REJECTED
            bank.verified = False

        bank.review_note = note
        bank.reviewed_at = timezone.now()
        bank.reviewed_by = request.user
        bank.save(
            update_fields=[
                "review_status",
                "verified",
                "visibility",
                "review_note",
                "reviewed_at",
                "reviewed_by",
                "updated_at",
            ]
        )
        return Response(QuestionBankSerializer(bank).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get", "post"], url_path="questions")
    def questions(self, request, uuid=None, pk=None):
        if request.method.lower() == "get":
            bank = get_bank_for_read(bank_uuid=uuid, user=request.user)
            if not bank:
                bank_exists = QuestionBank.objects.filter(uuid=uuid, is_archived=False).exists()
                if not bank_exists:
                    return Response({"detail": "Bank not found."}, status=status.HTTP_404_NOT_FOUND)
                return Response({"detail": "No access to this bank."}, status=status.HTTP_403_FORBIDDEN)
            rows = get_bank_questions_payload(bank=bank)
            serializer = QuestionBankItemReadSerializer(rows, many=True)
            return Response(serializer.data)

        bank = QuestionBank.objects.filter(uuid=uuid, is_archived=False).first()
        if not bank:
            return Response({"detail": "Bank not found."}, status=status.HTTP_404_NOT_FOUND)

        self.check_object_permissions(request, bank)

        serializer = QuestionBankItemWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        question_type = serializer.validated_data.get("question_type")
        if bank.category == QuestionBank.Category.CODING and question_type != Question.QuestionType.CODING:
            return Response(
                {"detail": "Coding bank only accepts coding questions."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if bank.category == QuestionBank.Category.EXAM and question_type != Question.QuestionType.EXAM:
            return Response(
                {"detail": "Exam bank only accepts exam questions."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        question = create_bank_question(
            bank=bank,
            created_by=request.user,
            validated_data=serializer.validated_data,
        )
        question.refresh_from_db()
        return Response(_serialize_bank_question_response(question=question), status=status.HTTP_201_CREATED)


class QuestionBankItemViewSet(
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = QuestionBankItemWriteSerializer

    def retrieve(self, request, *args, **kwargs):
        target = resolve_bank_question_target_for_user(
            user=request.user,
            raw_id=kwargs.get("pk"),
        )
        if not target:
            raise Http404
        return Response(
            _serialize_bank_question_response(
                question=target.legacy_question,
                membership=target.membership,
            )
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        target = resolve_bank_question_target_for_user(
            user=request.user,
            raw_id=kwargs.get("pk"),
        )
        if not target:
            raise Http404
        instance = target.legacy_question
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        if instance is None:
            if not target.membership:
                raise Http404
            instance = materialize_bank_question_adapter_for_membership(
                membership=target.membership,
                actor=request.user,
            )
        question = update_bank_question(
            question=instance,
            validated_data=serializer.validated_data,
            actor=request.user,
        )
        question.refresh_from_db()
        membership = target.membership or getattr(question, "asset_membership", None)
        return Response(_serialize_bank_question_response(question=question, membership=membership))

    def destroy(self, request, *args, **kwargs):
        target = resolve_bank_question_target_for_user(
            user=request.user,
            raw_id=kwargs.get("pk"),
        )
        if not target:
            raise Http404
        if target.membership:
            target.membership.delete()
        if target.legacy_question and (
            not target.membership or target.membership.legacy_question_id == target.legacy_question.id
        ):
            target.legacy_question.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="clone-to-my-bank")
    def clone_to_my_bank(self, request, pk=None):
        target = resolve_bank_question_target_for_user(
            user=request.user,
            raw_id=pk,
            allow_cloneable=True,
        )
        if not target:
            raise Http404
        source_question = target.legacy_question
        if source_question is None:
            if not target.membership:
                raise Http404
            source_question = materialize_bank_question_adapter_for_membership(
                membership=target.membership,
                actor=request.user,
            )

        if source_question.bank.owner_id != request.user.id and not is_publicly_accessible_bank(source_question.bank):
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
        cloned.refresh_from_db()
        return Response(_serialize_bank_question_response(question=cloned), status=status.HTTP_201_CREATED)
