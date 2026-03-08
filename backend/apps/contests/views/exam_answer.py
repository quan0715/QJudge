"""ExamAnswerViewSet — student answer submission and TA grading."""
from decimal import Decimal, ROUND_HALF_UP

from django.utils import timezone
from django.db.models import Sum
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from ..models import (
    Contest,
    ContestParticipant,
    ExamQuestion,
    ExamAnswer,
)
from ..serializers import (
    ExamAnswerSerializer,
    ExamAnswerDetailSerializer,
    ExamAnswerSubmitSerializer,
    ExamAnswerGradeSerializer,
)
from ..permissions import can_manage_contest
from ..services.exam_validation import validate_exam_operation


class ExamAnswerViewSet(viewsets.GenericViewSet):
    """
    ViewSet for exam answer operations.
    Students submit/retrieve answers; TAs grade answers and view results.
    """
    permission_classes = [permissions.IsAuthenticated]

    def _get_contest(self, contest_pk):
        return get_object_or_404(Contest, pk=contest_pk)

    # ── Student endpoints ──

    @action(detail=False, methods=['post'], url_path='submit')
    def submit_answer(self, request, contest_pk=None):
        """Submit or update a single answer (auto-save)."""
        contest = self._get_contest(contest_pk)
        participant, error = validate_exam_operation(
            contest, request.user, require_in_progress=True
        )
        if error:
            return error

        serializer = ExamAnswerSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        question_id = serializer.validated_data['question_id']
        try:
            question = ExamQuestion.objects.get(
                id=question_id, contest=contest
            )
        except ExamQuestion.DoesNotExist:
            return Response(
                {'error': 'Question not found in this contest.'},
                status=status.HTTP_404_NOT_FOUND
            )

        answer_obj, created = ExamAnswer.objects.update_or_create(
            participant=participant,
            question=question,
            defaults={'answer': serializer.validated_data['answer']}
        )
        # 首次建立時記錄題目快照（後續更新答案不覆蓋快照）
        if created:
            answer_obj.question_snapshot = question.to_snapshot()
        # Auto-grade objective questions
        answer_obj.auto_grade()
        answer_obj.save()

        return Response(
            ExamAnswerSerializer(answer_obj).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )

    @action(detail=False, methods=['get'], url_path='my-answers')
    def my_answers(self, request, contest_pk=None):
        """Get all answers for the current student in this contest."""
        contest = self._get_contest(contest_pk)
        participant, error = validate_exam_operation(
            contest, request.user, require_in_progress=False
        )
        if error:
            return error
        if participant is None:
            return Response(
                {'error': 'Not registered for this contest.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        answers = ExamAnswer.objects.filter(
            participant=participant
        ).select_related('question')
        return Response(ExamAnswerSerializer(answers, many=True).data)

    @action(detail=False, methods=['get'], url_path='results')
    def results(self, request, contest_pk=None):
        """Get graded results (only when results are published)."""
        contest = self._get_contest(contest_pk)

        # Check if results are published
        if not contest.results_published:
            if not can_manage_contest(request.user, contest):
                return Response(
                    {'error': 'Results have not been published yet.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        try:
            participant = ContestParticipant.objects.get(
                contest=contest, user=request.user
            )
        except ContestParticipant.DoesNotExist:
            return Response(
                {'error': 'Not registered for this contest.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        answers = ExamAnswer.objects.filter(
            participant=participant
        ).select_related('question', 'graded_by')
        return Response(ExamAnswerDetailSerializer(answers, many=True).data)

    # ── TA/Admin endpoints ──

    @action(detail=False, methods=['get'], url_path='all-answers')
    def all_answers(self, request, contest_pk=None):
        """List all answers for all students (TA/admin only)."""
        contest = self._get_contest(contest_pk)
        if not can_manage_contest(request.user, contest):
            raise PermissionDenied('Only contest staff can view all answers.')

        answers = ExamAnswer.objects.filter(
            participant__contest=contest
        ).select_related('participant__user', 'question', 'graded_by')

        # Optional filter by participant (supports both participant_id and user_id)
        participant_id = request.query_params.get('participant_id')
        user_id = request.query_params.get('user_id')
        if participant_id:
            answers = answers.filter(participant_id=participant_id)
        elif user_id:
            answers = answers.filter(participant__user_id=user_id)

        return Response(ExamAnswerDetailSerializer(answers, many=True).data)

    @action(detail=True, methods=['post'], url_path='grade')
    def grade_answer(self, request, contest_pk=None, pk=None):
        """Grade a single answer (TA/admin only)."""
        contest = self._get_contest(contest_pk)
        if not can_manage_contest(request.user, contest):
            raise PermissionDenied('Only contest staff can grade answers.')

        answer_obj = get_object_or_404(
            ExamAnswer.objects.filter(participant__contest=contest),
            pk=pk
        )

        serializer = ExamAnswerGradeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        answer_obj.score = serializer.validated_data['score']
        answer_obj.feedback = serializer.validated_data.get('feedback', '')
        answer_obj.graded_by = request.user
        answer_obj.graded_at = timezone.now()
        answer_obj.is_correct = answer_obj.score > 0
        answer_obj.save()

        # Update participant total score
        total = ExamAnswer.objects.filter(
            participant=answer_obj.participant,
            score__isnull=False
        ).aggregate(total=Sum('score'))['total'] or 0
        rounded_total = Decimal(total).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        answer_obj.participant.score = int(rounded_total)
        answer_obj.participant.save(update_fields=['score'])

        return Response(ExamAnswerDetailSerializer(answer_obj).data)
