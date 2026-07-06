"""ContestExamQuestionGroupViewSet."""

from django.db import transaction
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError as DRFValidationError
from rest_framework.response import Response

from ..models import Contest, ExamQuestion, ExamQuestionGroup
from ..permissions import can_manage_contest
from ..serializers import ExamQuestionGroupSerializer
from ..services.question_edit_lock import ensure_contest_question_editable
from ..services.activity_log import log_contest_activity


class ContestExamQuestionGroupViewSet(viewsets.ModelViewSet):
    """CRUD for contest-local paper exam question groups."""

    serializer_class = ExamQuestionGroupSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def _get_contest(self):
        return get_object_or_404(Contest, pk=self.kwargs.get('contest_pk'))

    def _ensure_admin_permission(self, contest):
        if not can_manage_contest(self.request.user, contest):
            raise PermissionDenied('Only contest owner/admin can manage exam question groups')

    def get_queryset(self):
        contest = self._get_contest()
        self._ensure_admin_permission(contest)
        return (
            ExamQuestionGroup.objects.filter(contest=contest)
            .annotate(total_score_annotated=Sum('questions__score'))
            .order_by('order', 'created_at')
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['contest'] = self._get_contest()
        return context

    def perform_create(self, serializer):
        contest = self._get_contest()
        self._ensure_admin_permission(contest)
        ensure_contest_question_editable(
            contest=contest,
            actor_id=getattr(self.request.user, 'id', None),
            action='exam_question_group.create',
        )
        serializer.save(contest=contest)
        log_contest_activity(
            contest,
            self.request.user,
            'update_problem',
            'Created exam question group',
        )

    def perform_update(self, serializer):
        contest = self._get_contest()
        self._ensure_admin_permission(contest)
        ensure_contest_question_editable(
            contest=contest,
            actor_id=getattr(self.request.user, 'id', None),
            action='exam_question_group.update',
        )
        serializer.save()
        log_contest_activity(
            contest,
            self.request.user,
            'update_problem',
            'Updated exam question group',
        )

    def perform_destroy(self, instance):
        contest = self._get_contest()
        self._ensure_admin_permission(contest)
        ensure_contest_question_editable(
            contest=contest,
            actor_id=getattr(self.request.user, 'id', None),
            action='exam_question_group.delete',
        )
        instance.delete()
        log_contest_activity(
            contest,
            self.request.user,
            'update_problem',
            'Deleted exam question group',
        )

    @staticmethod
    def _sections_for_contest(contest):
        sections = []
        seen_groups = set()
        questions = (
            ExamQuestion.objects.filter(contest=contest)
            .select_related('group')
            .order_by('order', 'id')
        )

        for question in questions:
            if question.group_id is None:
                sections.append({
                    'kind': 'flat',
                    'group': None,
                    'questions': [question],
                    'first_order': question.order,
                })
                continue

            if question.group_id in seen_groups:
                continue

            seen_groups.add(question.group_id)
            grouped_questions = list(
                ExamQuestion.objects.filter(contest=contest, group_id=question.group_id)
                .order_by('order_in_group', 'order', 'id')
            )
            sections.append({
                'kind': 'group',
                'group': question.group,
                'questions': grouped_questions,
                'first_order': question.order,
            })

        return sections

    @action(detail=False, methods=['post'], url_path='reorder')
    def reorder(self, request, contest_pk=None):
        contest = self._get_contest()
        self._ensure_admin_permission(contest)
        ensure_contest_question_editable(
            contest=contest,
            actor_id=getattr(request.user, 'id', None),
            action='exam_question_group.reorder',
        )

        groups = request.data.get('groups', [])
        if not isinstance(groups, list) or not groups:
            raise DRFValidationError('groups must be a non-empty list')

        requested_orders = {}
        for item in groups:
            if not isinstance(item, dict) or item.get('id') is None or item.get('order') is None:
                raise DRFValidationError('each group requires id and order')
            try:
                requested_orders[str(item['id'])] = int(item['order'])
            except (TypeError, ValueError):
                raise DRFValidationError({'order': 'order must be an integer'})

        with transaction.atomic():
            ExamQuestionGroup.objects.select_for_update().filter(contest=contest).exists()
            ExamQuestion.objects.select_for_update().filter(contest=contest).exists()

            known_group_ids = set(
                ExamQuestionGroup.objects.filter(contest=contest, id__in=requested_orders.keys())
                .values_list('id', flat=True)
            )
            if len(known_group_ids) != len(requested_orders):
                raise DRFValidationError('group not found in this contest')

            sections = self._sections_for_contest(contest)
            sections.sort(
                key=lambda section: (
                    requested_orders.get(str(section['group'].id), section['first_order'])
                    if section['kind'] == 'group'
                    else section['first_order'],
                    0 if section['kind'] == 'group' and str(section['group'].id) in requested_orders else 1,
                    section['first_order'],
                )
            )

            next_order = 0
            dirty_questions = []
            dirty_groups = []

            for section in sections:
                if section['kind'] == 'flat':
                    question = section['questions'][0]
                    if question.order != next_order:
                        question.order = next_order
                        dirty_questions.append(question)
                    next_order += 1
                    continue

                group = section['group']
                if group.order != next_order:
                    group.order = next_order
                    dirty_groups.append(group)

                for group_index, question in enumerate(section['questions'], start=1):
                    changed = False
                    if question.order != next_order:
                        question.order = next_order
                        changed = True
                    if question.order_in_group != group_index:
                        question.order_in_group = group_index
                        changed = True
                    if changed:
                        dirty_questions.append(question)
                    next_order += 1

            if dirty_questions:
                ExamQuestion.objects.bulk_update(dirty_questions, ['order', 'order_in_group'])
            if dirty_groups:
                ExamQuestionGroup.objects.bulk_update(dirty_groups, ['order'])

        log_contest_activity(
            contest,
            request.user,
            'update_problem',
            'Reordered exam question groups',
        )

        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
