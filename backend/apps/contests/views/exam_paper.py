"""Composite exam paper endpoint with block-level authoring facade."""

from django.db import transaction
from django.db.models import F, Sum
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError as DRFValidationError
from rest_framework.response import Response

from ..models import Contest, ExamQuestion, ExamQuestionGroup
from ..permissions import can_manage_contest
from ..serializers import (
    ExamQuestionGroupSerializer,
    ExamQuestionSerializer,
    ExamQuestionStudentSerializer,
)
from ..services.question_edit_lock import ensure_contest_question_editable
from apps.question_bank.question_assets import (
    cleanup_orphan_asset_if_needed,
    ensure_contest_binding_for_exam_question,
)
from .activity import ContestActivityViewSet
from .exam_validation_response import (
    build_device_conflict_response_for_view,
    validate_exam_operation_for_view,
)


class ContestExamPaperViewSet(viewsets.ViewSet):
    """Read and mutate a paper as ordered authoring blocks.

    The public contract is block-oriented. The group/question split remains a
    persistence detail so the frontend does not need separate group CRUD.
    """

    permission_classes = [permissions.IsAuthenticated]

    def _get_contest(self, contest_pk):
        return get_object_or_404(Contest, pk=contest_pk)

    @staticmethod
    def _is_admin(user, contest):
        return can_manage_contest(user, contest)

    def _ensure_admin_permission(self, request, contest):
        if not self._is_admin(request.user, contest):
            raise PermissionDenied('Only contest owner/admin can manage exam paper blocks')

    def _question_serializer_class(self, request, contest):
        if self._is_admin(request.user, contest):
            return ExamQuestionSerializer
        return ExamQuestionStudentSerializer

    def _serialize_question(self, question, request, contest):
        serializer_class = self._question_serializer_class(request, contest)
        return serializer_class(question, context={'contest': contest}).data

    def _serialize_group(self, group):
        annotated = (
            ExamQuestionGroup.objects.filter(pk=group.pk)
            .annotate(total_score_annotated=Sum('questions__score'))
            .first()
        )
        return ExamQuestionGroupSerializer(annotated or group).data

    def _paper_queryset(self, contest):
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
        return questions, groups

    def _build_sections(self, contest):
        sections = []
        seen_group_ids = set()
        questions = list(
            ExamQuestion.objects.filter(contest=contest)
            .select_related('group')
            .order_by('order', 'id')
        )
        groups_by_id = {
            group.id: group
            for group in ExamQuestionGroup.objects.filter(contest=contest).order_by('order', 'created_at')
        }

        for question in questions:
            if question.group_id is None:
                sections.append({
                    'kind': 'question',
                    'id': str(question.id),
                    'question': question,
                    'children': [],
                    'first_order': question.order,
                })
                continue

            if question.group_id in seen_group_ids:
                continue

            seen_group_ids.add(question.group_id)
            group = groups_by_id.get(question.group_id) or question.group
            children = list(
                ExamQuestion.objects.filter(contest=contest, group_id=question.group_id)
                .order_by('order_in_group', 'order', 'id')
            )
            sections.append({
                'kind': 'group',
                'id': str(question.group_id),
                'group': group,
                'children': children,
                'first_order': question.order,
            })

        for group in groups_by_id.values():
            if group.id in seen_group_ids:
                continue
            sections.append({
                'kind': 'group',
                'id': str(group.id),
                'group': group,
                'children': [],
                'first_order': group.order,
            })

        return sorted(sections, key=lambda section: (section['first_order'], section['id']))

    def _serialize_block(self, section, request, contest):
        if section['kind'] == 'question':
            question_data = self._serialize_question(section['question'], request, contest)
            return {
                'kind': 'question',
                'id': question_data['id'],
                'question': question_data,
            }

        group_data = self._serialize_group(section['group'])
        return {
            'kind': 'group',
            'id': group_data['id'],
            'group': group_data,
            'children': [
                self._serialize_question(question, request, contest)
                for question in section['children']
            ],
        }

    def _build_paper_response(self, request, contest, status_code=status.HTTP_200_OK):
        questions, groups = self._paper_queryset(contest)
        question_serializer_class = self._question_serializer_class(request, contest)
        sections = self._build_sections(contest)
        return Response(
            {
                'questions': question_serializer_class(
                    questions,
                    many=True,
                    context={'contest': contest},
                ).data,
                'groups': ExamQuestionGroupSerializer(groups, many=True).data,
                'blocks': [
                    self._serialize_block(section, request, contest)
                    for section in sections
                ],
            },
            status=status_code,
        )

    @staticmethod
    def _next_order(contest):
        last_question = (
            ExamQuestion.objects.filter(contest=contest)
            .order_by('-order', '-id')
            .first()
        )
        if last_question is not None:
            return last_question.order + 1
        last_group = (
            ExamQuestionGroup.objects.filter(contest=contest)
            .order_by('-order', '-created_at')
            .first()
        )
        return (last_group.order + 1) if last_group is not None else 0

    @staticmethod
    def _int_or_default(value, default):
        if value is None:
            return default
        try:
            return int(value)
        except (TypeError, ValueError):
            raise DRFValidationError({'order': 'order must be an integer'})

    def _create_question(self, request, contest, payload, order, group=None, order_in_group=None):
        data = dict(payload)
        data['order'] = order
        if group is not None:
            data['group_id'] = str(group.id)
            data['order_in_group'] = order_in_group
        else:
            data['group_id'] = None
            data['order_in_group'] = None

        serializer = ExamQuestionSerializer(
            data=data,
            context={'contest': contest},
        )
        serializer.is_valid(raise_exception=True)
        question = serializer.save(contest=contest)
        ensure_contest_binding_for_exam_question(
            exam_question=question,
            actor=request.user,
        )
        return question

    def _normalize_orders(self, contest):
        questions = list(
            ExamQuestion.objects.filter(contest=contest)
            .select_related('group')
            .order_by('order', 'id')
        )
        dirty = []
        for index, question in enumerate(questions):
            changed = False
            if question.order != index:
                question.order = index
                changed = True
            if question.group_id is None and question.order_in_group is not None:
                question.order_in_group = None
                changed = True
            if changed:
                dirty.append(question)
        if dirty:
            ExamQuestion.objects.bulk_update(dirty, ['order', 'order_in_group'])

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

        return self._build_paper_response(request, contest)

    def retrieve(self, request, contest_pk=None, pk=None):
        contest = self._get_contest(contest_pk)
        participant, error_response = validate_exam_operation_for_view(
            contest,
            request.user,
            require_in_progress=not self._is_admin(request.user, contest),
        )
        if error_response is not None:
            return error_response

        if participant is not None and not self._is_admin(request.user, contest):
            conflict_response = build_device_conflict_response_for_view(contest, participant, request)
            if conflict_response is not None:
                return conflict_response

        for section in self._build_sections(contest):
            if section['id'] == str(pk):
                return Response(self._serialize_block(section, request, contest))
        raise DRFValidationError('paper block not found')

    def create(self, request, contest_pk=None):
        contest = self._get_contest(contest_pk)
        self._ensure_admin_permission(request, contest)
        ensure_contest_question_editable(
            contest=contest,
            actor_id=getattr(request.user, 'id', None),
            action='exam_paper.block.create',
        )

        kind = request.data.get('kind')
        if kind not in {'question', 'group'}:
            raise DRFValidationError({'kind': 'kind must be question or group'})

        with transaction.atomic():
            ExamQuestion.objects.select_for_update().filter(contest=contest).exists()
            ExamQuestionGroup.objects.select_for_update().filter(contest=contest).exists()

            if kind == 'question':
                question_payload = request.data.get('question')
                if not isinstance(question_payload, dict):
                    raise DRFValidationError({'question': 'question payload is required'})
                order = self._int_or_default(question_payload.get('order'), self._next_order(contest))
                ExamQuestion.objects.filter(contest=contest, order__gte=order).update(order=F('order') + 1)
                question = self._create_question(request, contest, question_payload, order)
                section = {
                    'kind': 'question',
                    'id': str(question.id),
                    'question': question,
                    'children': [],
                }

            else:
                group_payload = request.data.get('group') or {}
                if not isinstance(group_payload, dict):
                    raise DRFValidationError({'group': 'group payload must be an object'})
                children_payload = request.data.get('children') or []
                if not isinstance(children_payload, list):
                    raise DRFValidationError({'children': 'children must be an array'})

                order = self._int_or_default(group_payload.get('order'), self._next_order(contest))
                order_span = max(1, len(children_payload))
                if order_span:
                    ExamQuestion.objects.filter(contest=contest, order__gte=order).update(
                        order=F('order') + order_span,
                    )
                group = ExamQuestionGroup.objects.create(
                    contest=contest,
                    title=str(group_payload.get('title') or ''),
                    shared_stem_markdown=str(group_payload.get('shared_stem_markdown') or ''),
                    order=order,
                )
                children = [
                    self._create_question(
                        request,
                        contest,
                        child_payload,
                        order + index,
                        group=group,
                        order_in_group=index + 1,
                    )
                    for index, child_payload in enumerate(children_payload)
                ]
                section = {
                    'kind': 'group',
                    'id': str(group.id),
                    'group': group,
                    'children': children,
                }

        ContestActivityViewSet.log_activity(
            contest,
            request.user,
            'update_problem',
            f"Created exam paper {kind} block",
        )
        return Response(
            self._serialize_block(section, request, contest),
            status=status.HTTP_201_CREATED,
        )

    def partial_update_collection(self, request, contest_pk=None):
        contest = self._get_contest(contest_pk)
        self._ensure_admin_permission(request, contest)
        ensure_contest_question_editable(
            contest=contest,
            actor_id=getattr(request.user, 'id', None),
            action='exam_paper.block.reorder',
        )

        blocks = request.data.get('blocks')
        if not isinstance(blocks, list) or not blocks:
            raise DRFValidationError({'blocks': 'blocks must be a non-empty array'})

        with transaction.atomic():
            ExamQuestion.objects.select_for_update().filter(contest=contest).exists()
            ExamQuestionGroup.objects.select_for_update().filter(contest=contest).exists()

            existing_sections = self._build_sections(contest)
            section_by_key = {
                (section['kind'], section['id']): section
                for section in existing_sections
            }
            ordered_sections = []
            seen = set()

            for block in blocks:
                if not isinstance(block, dict):
                    raise DRFValidationError({'blocks': 'each block must be an object'})
                key = (block.get('kind'), str(block.get('id')))
                if key not in section_by_key:
                    raise DRFValidationError({'blocks': f'unknown paper block {key[1]}'})
                if key in seen:
                    raise DRFValidationError({'blocks': f'duplicate paper block {key[1]}'})
                ordered_sections.append(section_by_key[key])
                seen.add(key)

            ordered_sections.extend(
                section for section in existing_sections
                if (section['kind'], section['id']) not in seen
            )

            next_order = 0
            dirty_questions = []
            dirty_groups = []
            for section in ordered_sections:
                if section['kind'] == 'question':
                    question = section['question']
                    changed = False
                    if question.order != next_order:
                        question.order = next_order
                        changed = True
                    if question.group_id is not None:
                        question.group = None
                        question.order_in_group = None
                        changed = True
                    if changed:
                        dirty_questions.append(question)
                    next_order += 1
                    continue

                group = section['group']
                if group.order != next_order:
                    group.order = next_order
                    dirty_groups.append(group)
                if not section['children']:
                    next_order += 1
                    continue
                for child_index, question in enumerate(section['children'], start=1):
                    changed = False
                    if question.order != next_order:
                        question.order = next_order
                        changed = True
                    if question.group_id != group.id:
                        question.group = group
                        changed = True
                    if question.order_in_group != child_index:
                        question.order_in_group = child_index
                        changed = True
                    if changed:
                        dirty_questions.append(question)
                    next_order += 1

            if dirty_questions:
                ExamQuestion.objects.bulk_update(dirty_questions, ['order', 'group', 'order_in_group'])
            if dirty_groups:
                ExamQuestionGroup.objects.bulk_update(dirty_groups, ['order'])

        ContestActivityViewSet.log_activity(
            contest,
            request.user,
            'update_problem',
            'Reordered exam paper blocks',
        )
        return self._build_paper_response(request, contest)

    def partial_update(self, request, contest_pk=None, pk=None):
        contest = self._get_contest(contest_pk)
        self._ensure_admin_permission(request, contest)
        ensure_contest_question_editable(
            contest=contest,
            actor_id=getattr(request.user, 'id', None),
            action='exam_paper.block.update',
        )

        kind = request.data.get('kind')

        with transaction.atomic():
            question = ExamQuestion.objects.filter(contest=contest, id=pk).first()
            group = ExamQuestionGroup.objects.filter(contest=contest, id=pk).first()

            if kind == 'question' or (kind is None and question is not None and group is None):
                if question is None:
                    raise DRFValidationError('question block not found')
                question_payload = request.data.get('question')
                if not isinstance(question_payload, dict):
                    raise DRFValidationError({'question': 'question payload is required'})
                serializer = ExamQuestionSerializer(
                    question,
                    data=question_payload,
                    partial=True,
                    context={'contest': contest},
                )
                serializer.is_valid(raise_exception=True)
                question = serializer.save()
                ensure_contest_binding_for_exam_question(
                    exam_question=question,
                    actor=request.user,
                )
                section = {
                    'kind': 'question',
                    'id': str(question.id),
                    'question': question,
                    'children': [],
                }

            else:
                if group is None:
                    raise DRFValidationError('group block not found')
                group_payload = request.data.get('group') or {}
                if group_payload:
                    if not isinstance(group_payload, dict):
                        raise DRFValidationError({'group': 'group payload must be an object'})
                    if 'title' in group_payload:
                        group.title = str(group_payload.get('title') or '')
                    if 'shared_stem_markdown' in group_payload:
                        group.shared_stem_markdown = str(group_payload.get('shared_stem_markdown') or '')
                    if 'order' in group_payload:
                        group.order = self._int_or_default(group_payload.get('order'), group.order)
                    group.save(update_fields=['title', 'shared_stem_markdown', 'order', 'updated_at'])

                children_payload = request.data.get('children')
                if children_payload is not None:
                    if not isinstance(children_payload, list):
                        raise DRFValidationError({'children': 'children must be an array'})
                    children = list(group.questions.order_by('order_in_group', 'order', 'id'))
                    next_order = children[-1].order + 1 if children else group.order
                    for child_payload in children_payload:
                        if not isinstance(child_payload, dict):
                            raise DRFValidationError({'children': 'each child must be an object'})
                        child_id = child_payload.get('id')
                        if child_id:
                            child = group.questions.filter(id=child_id).first()
                            if child is None:
                                raise DRFValidationError({'children': f'unknown child {child_id}'})
                            serializer = ExamQuestionSerializer(
                                child,
                                data=child_payload,
                                partial=True,
                                context={'contest': contest},
                            )
                            serializer.is_valid(raise_exception=True)
                            child = serializer.save()
                            ensure_contest_binding_for_exam_question(
                                exam_question=child,
                                actor=request.user,
                            )
                        else:
                            child_payload = dict(child_payload)
                            uses_reserved_group_slot = not children and next_order == group.order
                            if not uses_reserved_group_slot:
                                ExamQuestion.objects.filter(contest=contest, order__gte=next_order).update(
                                    order=F('order') + 1,
                                )
                            self._create_question(
                                request,
                                contest,
                                child_payload,
                                next_order,
                                group=group,
                                order_in_group=group.questions.count() + 1,
                            )
                            next_order += 1

                children = list(group.questions.order_by('order_in_group', 'order', 'id'))
                dirty = []
                for index, child in enumerate(children, start=1):
                    if child.order_in_group != index:
                        child.order_in_group = index
                        dirty.append(child)
                if dirty:
                    ExamQuestion.objects.bulk_update(dirty, ['order_in_group'])

                section = {
                    'kind': 'group',
                    'id': str(group.id),
                    'group': group,
                    'children': list(group.questions.order_by('order_in_group', 'order', 'id')),
                }

        ContestActivityViewSet.log_activity(
            contest,
            request.user,
            'update_problem',
            f"Updated exam paper {section['kind']} block",
        )
        return Response(self._serialize_block(section, request, contest))

    def destroy(self, request, contest_pk=None, pk=None):
        contest = self._get_contest(contest_pk)
        self._ensure_admin_permission(request, contest)
        ensure_contest_question_editable(
            contest=contest,
            actor_id=getattr(request.user, 'id', None),
            action='exam_paper.block.delete',
        )

        with transaction.atomic():
            question = ExamQuestion.objects.filter(contest=contest, id=pk).first()
            group = ExamQuestionGroup.objects.filter(contest=contest, id=pk).first()
            if group is not None:
                child_assets = [
                    child.question_asset
                    for child in group.questions.select_related('question_asset')
                    if child.question_asset_id
                ]
                group.questions.all().delete()
                group.delete()
                for asset in child_assets:
                    cleanup_orphan_asset_if_needed(asset)
            elif question is not None:
                question_asset = question.question_asset
                question.delete()
                cleanup_orphan_asset_if_needed(question_asset)
            else:
                raise DRFValidationError('paper block not found')
            self._normalize_orders(contest)

        ContestActivityViewSet.log_activity(
            contest,
            request.user,
            'update_problem',
            f"Deleted exam paper block {pk}",
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
