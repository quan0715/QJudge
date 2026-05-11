"""Composite student exam paper endpoint."""

from django.db.models import Sum
from django.shortcuts import get_object_or_404
from rest_framework import permissions, viewsets
from rest_framework.response import Response

from ..models import Contest, ExamQuestion, ExamQuestionGroup
from ..serializers import ExamQuestionGroupSerializer, ExamQuestionStudentSerializer
from .exam_validation_response import (
    build_device_conflict_response_for_view,
    validate_exam_operation_for_view,
)


class ContestExamPaperViewSet(viewsets.ViewSet):
    """Return one consistent paper snapshot for student runtime."""

    permission_classes = [permissions.IsAuthenticated]

    def _get_contest(self, contest_pk):
        return get_object_or_404(Contest, pk=contest_pk)

    def list(self, request, contest_pk=None):
        contest = self._get_contest(contest_pk)
        participant, error_response = validate_exam_operation_for_view(
            contest,
            request.user,
            require_in_progress=True,
        )
        if error_response is not None:
            return error_response

        if participant is not None:
            conflict_response = build_device_conflict_response_for_view(contest, participant, request)
            if conflict_response is not None:
                return conflict_response

        questions = (
            ExamQuestion.objects.filter(contest=contest)
            .select_related('group', 'question_asset', 'question_version')
            .order_by('order', 'id')
        )
        groups = (
            ExamQuestionGroup.objects.filter(contest=contest)
            .annotate(total_score_annotated=Sum('questions__score'))
            .order_by('order', 'created_at')
        )

        return Response({
            'questions': ExamQuestionStudentSerializer(questions, many=True).data,
            'groups': ExamQuestionGroupSerializer(groups, many=True).data,
        })
