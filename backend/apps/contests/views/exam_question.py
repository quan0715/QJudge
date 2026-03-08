"""ContestExamQuestionViewSet."""
import logging

from django.utils import timezone
from django.db.models import Max
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from ..models import (
    Contest,
    ExamQuestion,
    ExamStatus,
)
from ..serializers import (
    ExamQuestionSerializer,
    ExamQuestionStudentSerializer,
)
from ..permissions import can_manage_contest
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

    def get_serializer_class(self):
        contest = self._get_contest()
        if self._is_admin(contest):
            return ExamQuestionSerializer
        return ExamQuestionStudentSerializer

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

        try:
            return build_paper_exam_sheet_response(
                contest=contest,
                mode=mode,
                language=language,
                scale=scale,
            )
        except ExportValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            logger.exception("Failed to generate paper exam sheet: %s", exc)
            return Response(
                {"error": "Failed to generate paper exam sheet"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
