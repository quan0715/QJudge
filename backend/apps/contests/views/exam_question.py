"""ContestExamQuestionViewSet."""
import logging

from django.db import transaction
from django.utils import timezone
from django.db.models import Max
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from apps.question_bank.models import Question, QuestionBank
from apps.question_bank.services import is_platform_public_bank

from ..models import (
    Contest,
    ExamQuestion,
    ExamStatus,
    ExamQuestionType,
)
from ..serializers import (
    ExamQuestionSerializer,
    ExamQuestionStudentSerializer,
)
from ..permissions import can_manage_contest
from ..services.anti_cheat_session import build_device_conflict_response
from ..services.export_service import (
    ExportValidationError,
    build_paper_exam_sheet_response,
    parse_scale,
)
from .activity import ContestActivityViewSet

logger = logging.getLogger(__name__)


class ContestExamQuestionViewSet(viewsets.ModelViewSet):
    """
    CRUD for exam paper questions.
    - Admin/teacher: full CRUD with correct_answer visible.
    - Registered students: read-only list (correct_answer hidden).
    """

    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def _get_contest(self):
        contest_pk = self.kwargs.get('contest_pk')
        return get_object_or_404(Contest, pk=contest_pk)

    def _is_admin(self, contest):
        return can_manage_contest(self.request.user, contest)

    def _ensure_admin_permission(self, contest):
        if not self._is_admin(contest):
            raise PermissionDenied('Only contest owner/admin can manage exam questions')

    def _ensure_not_frozen(self, contest, force=False):
        """檢查考試題目是否已凍結（有學生開始作答後禁止修改/刪除/排序）"""
        if force:
            return
        if contest.has_exam_started():
            return Response(
                {'error': '考試已有學生開始作答，題目已凍結。如需強制修改請加 ?force=true 參數。'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return None

    def _resolve_bank_question_for_import(self, *, user, question_bank_id, question_id):
        bank = QuestionBank.objects.filter(uuid=question_bank_id, is_archived=False).first()
        if not bank:
            return None, None, "Question bank not found"

        if bank.owner_id != user.id and not is_platform_public_bank(bank):
            return None, None, "No access to this question bank"

        question = Question.objects.filter(
            bank=bank,
            id=question_id,
            question_type=Question.QuestionType.EXAM,
        ).first()
        if not question:
            return None, None, "Question not found in bank"

        return bank, question, None

    @staticmethod
    def _normalize_exam_question_type(question: Question) -> str:
        metadata = question.metadata if isinstance(question.metadata, dict) else {}
        raw_type = metadata.get("legacy_question_type")
        if raw_type in {
            ExamQuestionType.TRUE_FALSE,
            ExamQuestionType.SINGLE_CHOICE,
            ExamQuestionType.MULTIPLE_CHOICE,
            ExamQuestionType.SHORT_ANSWER,
            ExamQuestionType.ESSAY,
        }:
            return raw_type

        correct = question.correct_answer
        options = question.options if isinstance(question.options, list) else []

        if isinstance(correct, bool):
            return ExamQuestionType.TRUE_FALSE
        if isinstance(correct, list):
            return ExamQuestionType.MULTIPLE_CHOICE
        if isinstance(correct, int) and options:
            return ExamQuestionType.SINGLE_CHOICE
        return ExamQuestionType.ESSAY

    def get_serializer_class(self):
        contest = self._get_contest()
        if self._is_admin(contest):
            return ExamQuestionSerializer
        return ExamQuestionStudentSerializer

    def _check_student_device_guard(self):
        """Run device guard for student read actions (list/retrieve).

        Returns a conflict Response or None.  Called once per request
        from list()/retrieve() *before* DRF hits get_queryset().
        """
        contest = self._get_contest()
        if self._is_admin(contest):
            return None
        participant = contest.registrations.filter(user=self.request.user).first()
        if not participant or participant.exam_status == ExamStatus.SUBMITTED:
            return None
        return build_device_conflict_response(contest, participant, self.request)

    def get_queryset(self):
        contest = self._get_contest()
        # Students can only list; admin check is enforced per-action for writes
        if not self._is_admin(contest):
            # Students must be registered and have started exam to view questions.
            participant = contest.registrations.filter(user=self.request.user).first()
            if not participant:
                raise PermissionDenied('Not registered for this contest')
            if contest.status != 'published':
                raise PermissionDenied('Contest is not published')
            if contest.start_time and timezone.now() < contest.start_time:
                raise PermissionDenied('Contest has not started yet')
            if not participant.started_at and participant.exam_status != ExamStatus.SUBMITTED:
                raise PermissionDenied('You must start the exam before viewing questions')
        return ExamQuestion.objects.filter(contest=contest).order_by('order', 'id')

    def list(self, request, *args, **kwargs):
        conflict = self._check_student_device_guard()
        if conflict is not None:
            return conflict
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        conflict = self._check_student_device_guard()
        if conflict is not None:
            return conflict
        return super().retrieve(request, *args, **kwargs)

    def perform_create(self, serializer):
        contest = self._get_contest()
        self._ensure_admin_permission(contest)
        if 'order' not in self.request.data:
            last_order = ExamQuestion.objects.filter(contest=contest).aggregate(Max('order'))['order__max']
            serializer.save(contest=contest, order=(last_order if last_order is not None else -1) + 1)
            return

        serializer.save(contest=contest)

        ContestActivityViewSet.log_activity(
            contest,
            self.request.user,
            'update_problem',
            f"Created exam question #{serializer.instance.id}"
        )

    def perform_update(self, serializer):
        contest = self._get_contest()
        self._ensure_admin_permission(contest)
        force = self.request.query_params.get('force', '').lower() == 'true'
        frozen_response = self._ensure_not_frozen(contest, force)
        if frozen_response:
            raise PermissionDenied(frozen_response.data['error'])
        serializer.save()

        ContestActivityViewSet.log_activity(
            contest,
            self.request.user,
            'update_problem',
            f"Updated exam question #{serializer.instance.id}" + (" (force)" if force else "")
        )

    def perform_destroy(self, instance):
        contest = self._get_contest()
        self._ensure_admin_permission(contest)
        force = self.request.query_params.get('force', '').lower() == 'true'
        frozen_response = self._ensure_not_frozen(contest, force)
        if frozen_response:
            raise PermissionDenied(frozen_response.data['error'])
        question_id = instance.id
        instance.delete()

        ContestActivityViewSet.log_activity(
            contest,
            self.request.user,
            'update_problem',
            f"Deleted exam question #{question_id}" + (" (force)" if force else "")
        )

    @action(detail=False, methods=['post'], url_path='batch-import')
    def batch_import(self, request, contest_pk=None):
        """Delete all existing questions and create new ones in a single transaction."""
        contest = self._get_contest()
        self._ensure_admin_permission(contest)
        force = request.query_params.get('force', '').lower() == 'true'
        frozen_response = self._ensure_not_frozen(contest, force)
        if frozen_response:
            return frozen_response

        questions_data = request.data.get('questions', [])
        if not isinstance(questions_data, list):
            return Response(
                {'error': 'questions must be a list'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate all questions before touching the DB
        serializer = ExamQuestionSerializer(data=questions_data, many=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            ExamQuestion.objects.filter(contest=contest).delete()

            new_questions = []
            create_allowed_fields = {
                'question_type',
                'prompt',
                'options',
                'correct_answer',
                'score',
            }
            for idx, item_data in enumerate(serializer.validated_data):
                sanitized_data = {
                    key: value
                    for key, value in item_data.items()
                    if key in create_allowed_fields
                }
                new_questions.append(ExamQuestion(
                    contest=contest,
                    order=idx,
                    **sanitized_data,
                ))
            created = ExamQuestion.objects.bulk_create(new_questions)

        ContestActivityViewSet.log_activity(
            contest,
            request.user,
            'update_problem',
            f"Batch imported {len(created)} exam questions" + (" (force)" if force else ""),
        )

        result_serializer = self.get_serializer(
            ExamQuestion.objects.filter(contest=contest).order_by('order', 'id'),
            many=True,
        )
        return Response(result_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='import-from-bank')
    def import_from_bank(self, request, contest_pk=None):
        contest = self._get_contest()
        self._ensure_admin_permission(contest)
        force = request.query_params.get('force', '').lower() == 'true'
        frozen_response = self._ensure_not_frozen(contest, force)
        if frozen_response:
            return frozen_response

        import_mode = (request.data.get('import_mode') or "copy").lower()
        if import_mode not in {"copy", "reference"}:
            return Response({'error': 'Invalid import_mode'}, status=status.HTTP_400_BAD_REQUEST)

        items = request.data.get('items', [])
        if not isinstance(items, list) or not items:
            return Response({'error': 'items must be a non-empty list'}, status=status.HTTP_400_BAD_REQUEST)

        current_max_order = ExamQuestion.objects.filter(contest=contest).aggregate(Max('order'))['order__max']
        next_order = (current_max_order if current_max_order is not None else -1) + 1
        created_rows = []

        with transaction.atomic():
            for item in items:
                if not isinstance(item, dict):
                    return Response({'error': 'Invalid item payload'}, status=status.HTTP_400_BAD_REQUEST)

                question_bank_id = item.get('question_bank_id')
                question_id = item.get('question_id')
                if not question_bank_id or question_id is None:
                    return Response(
                        {'error': 'Each item requires question_bank_id and question_id'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                bank, bank_question, err = self._resolve_bank_question_for_import(
                    user=request.user,
                    question_bank_id=question_bank_id,
                    question_id=question_id,
                )
                if err:
                    return Response({'error': err}, status=status.HTTP_400_BAD_REQUEST)

                prompt = (bank_question.prompt or bank_question.title or "").strip()
                if not prompt:
                    return Response(
                        {'error': f'Imported question {bank_question.id} has empty prompt/title'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                exam_question = ExamQuestion.objects.create(
                    contest=contest,
                    question_type=self._normalize_exam_question_type(bank_question),
                    prompt=prompt,
                    options=bank_question.options or [],
                    correct_answer=bank_question.correct_answer,
                    score=max(1, int(bank_question.score or 1)),
                    order=next_order,
                )
                created_rows.append(exam_question)
                next_order += 1

        ContestActivityViewSet.log_activity(
            contest,
            request.user,
            'update_problem',
            f"Imported {len(created_rows)} exam questions from bank ({import_mode})" + (" (force)" if force else ""),
        )

        serialized = self.get_serializer(
            ExamQuestion.objects.filter(contest=contest).order_by('order', 'id'),
            many=True,
        )
        return Response(serialized.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='reorder')
    def reorder(self, request, contest_pk=None):
        contest = self._get_contest()
        self._ensure_admin_permission(contest)
        force = request.query_params.get('force', '').lower() == 'true'
        frozen_response = self._ensure_not_frozen(contest, force)
        if frozen_response:
            return frozen_response

        orders = request.data.get('orders', [])
        if not isinstance(orders, list) or not orders:
            return Response({'error': 'No orders provided'}, status=status.HTTP_400_BAD_REQUEST)

        for item in orders:
            question_id = item.get('id')
            new_order = item.get('order')
            if question_id is None or new_order is None:
                continue
            ExamQuestion.objects.filter(contest=contest, id=question_id).update(order=new_order)

        questions = ExamQuestion.objects.filter(contest=contest).order_by('order', 'id')
        for idx, question in enumerate(questions):
            if question.order != idx:
                question.order = idx
                question.save(update_fields=['order'])

        ContestActivityViewSet.log_activity(
            contest,
            request.user,
            'update_problem',
            "Reordered exam questions"
        )

        serialized = self.get_serializer(
            ExamQuestion.objects.filter(contest=contest).order_by('order', 'id'),
            many=True
        )
        return Response(serialized.data)

    @action(detail=False, methods=["get"], url_path="export-paper")
    def export_paper(self, request, contest_pk=None):
        """
        Export formal paper-exam PDF from backend.
        mode=question | answer
        """
        contest = self._get_contest()
        self._ensure_admin_permission(contest)

        mode = request.query_params.get("mode", "question")
        language = request.query_params.get("language", "zh-TW")
        scale = parse_scale(request.query_params.get("scale", "1.0"))
        include_answer_area = request.query_params.get("include_answer_area", "true").lower() == "true"

        try:
            return build_paper_exam_sheet_response(
                contest=contest,
                mode=mode,
                language=language,
                scale=scale,
                include_answer_area=include_answer_area,
            )
        except ExportValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            logger.exception("Failed to generate paper exam sheet: %s", exc)
            return Response(
                {"error": "Failed to generate paper exam sheet"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
