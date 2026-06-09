"""ContestExamQuestionViewSet."""
import logging

from django.db import transaction
from django.utils import timezone
from django.db.models import F, Max
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError as DRFValidationError
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from apps.question_bank.import_resolver import resolve_bank_question_for_import
from apps.question_bank.models import Question
from apps.question_bank.question_assets import (
    ensure_contest_binding_for_exam_question,
    ensure_question_asset_for_bank_question,
)

from ..models import (
    Contest,
    ExamQuestion,
    ExamQuestionScorePolicy,
    ExamStatus,
    ExamQuestionType,
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
from ..services.question_edit_lock import ensure_contest_question_editable
from ..services.score_recalculation import recalculate_all_scores
from .activity import ContestActivityViewSet
from .exam_validation_response import build_device_conflict_response_for_view

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

    def get_serializer_context(self):
        context = super().get_serializer_context()
        contest = self._get_contest()
        context['contest'] = contest
        # Inject effective_max_scores for admin serializer (computed once, avoids N+1)
        if self._is_admin(contest):
            from ..services.exam_scoring import ExamScoringService
            scoring = ExamScoringService(contest)
            context['effective_max_scores'] = scoring.get_effective_max_scores()
        return context

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
        return build_device_conflict_response_for_view(contest, participant, self.request)

    # Aliases consumed by the `?kind=` filter in addition to raw enum values.
    _KIND_ALIAS = {
        'subjective': {ExamQuestionType.SHORT_ANSWER, ExamQuestionType.ESSAY},
        'objective': {
            ExamQuestionType.TRUE_FALSE,
            ExamQuestionType.SINGLE_CHOICE,
            ExamQuestionType.MULTIPLE_CHOICE,
        },
    }

    @classmethod
    def _parse_kind_filter(cls, raw):
        """Translate ``?kind=<alias|csv of enums>`` into a set of enum values.

        Returns ``None`` for no filter, or an empty set for an unknown value
        (caller can treat empty-set as "no matches")."""
        if not raw:
            return None
        tokens = {t.strip() for t in raw.split(',') if t.strip()}
        if not tokens:
            return None
        kinds = set()
        all_enum_values = set(ExamQuestionType.values)
        for tok in tokens:
            if tok in cls._KIND_ALIAS:
                kinds |= cls._KIND_ALIAS[tok]
            elif tok in all_enum_values:
                kinds.add(tok)
            # Unknown tokens are ignored (strict validation would add noise for
            # a filter-only-hint query param).
        return kinds

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

        qs = ExamQuestion.objects.filter(contest=contest).order_by('order', 'id')

        kind_filter = self._parse_kind_filter(self.request.query_params.get('kind'))
        if kind_filter is not None:
            qs = qs.filter(question_type__in=kind_filter)

        return qs

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
        ensure_contest_question_editable(
            contest=contest,
            actor_id=getattr(self.request.user, "id", None),
            action="exam_question.create",
        )

        with transaction.atomic():
            # Lock the contest's existing exam questions so concurrent
            # create / import / reorder operations serialize and we can't
            # race past the unique (contest, order) constraint.
            existing = (
                ExamQuestion.objects.select_for_update()
                .filter(contest=contest)
                .order_by('order')
            )

            if 'order' not in self.request.data:
                last_order = existing.aggregate(Max('order'))['order__max']
                target_order = (last_order if last_order is not None else -1) + 1
                serializer.save(contest=contest, order=target_order)
            else:
                try:
                    requested_order = int(self.request.data['order'])
                except (TypeError, ValueError):
                    raise DRFValidationError({'order': 'order must be an integer'})

                # Push semantics: shift everything at or after the requested
                # slot one step down so the new question can occupy it
                # without colliding with existing rows.
                existing.filter(order__gte=requested_order).update(
                    order=F('order') + 1,
                )
                serializer.save(contest=contest, order=requested_order)

            ensure_contest_binding_for_exam_question(
                exam_question=serializer.instance,
                actor=self.request.user,
            )

        ContestActivityViewSet.log_activity(
            contest,
            self.request.user,
            'update_problem',
            f"Created exam question #{serializer.instance.id}"
        )

    def perform_update(self, serializer):
        contest = self._get_contest()
        self._ensure_admin_permission(contest)

        # Allow score_policy changes even when contest is locked (post-exam adjustment)
        updating_fields = set(self.request.data.keys())
        score_policy_only = updating_fields <= {"score_policy", "score_policy_config"}
        if not score_policy_only:
            ensure_contest_question_editable(
                contest=contest,
                actor_id=getattr(self.request.user, "id", None),
                action="exam_question.update",
            )

        old_policy = serializer.instance.score_policy
        old_score = serializer.instance.score
        with transaction.atomic():
            serializer.save()
            new_policy = serializer.instance.score_policy
            new_score = serializer.instance.score

            ensure_contest_binding_for_exam_question(
                exam_question=serializer.instance,
                actor=self.request.user,
            )

            # Recalculate all scores when policy or max score changes
            policy_changed = old_policy != new_policy
            score_changed_for_full_marks = (
                new_policy == ExamQuestionScorePolicy.FULL_MARKS
                and old_score != new_score
            )
            if policy_changed or score_changed_for_full_marks:
                recalculate_all_scores(contest)

        ContestActivityViewSet.log_activity(
            contest,
            self.request.user,
            'update_problem',
            f"Updated exam question #{serializer.instance.id}"
        )

    def perform_destroy(self, instance):
        contest = self._get_contest()
        self._ensure_admin_permission(contest)
        ensure_contest_question_editable(
            contest=contest,
            actor_id=getattr(self.request.user, "id", None),
            action="exam_question.delete",
        )
        question_id = instance.id
        question_asset = instance.question_asset
        instance.delete()

        # Clean up orphaned asset if no other bindings or bank memberships
        from apps.question_bank.question_assets import cleanup_orphan_asset_if_needed
        cleanup_orphan_asset_if_needed(question_asset)

        ContestActivityViewSet.log_activity(
            contest,
            self.request.user,
            'update_problem',
            f"Deleted exam question #{question_id}"
        )

    @staticmethod
    def _cleanup_orphan_exam_bindings(contest):
        from apps.question_bank.models import ContestQuestionBinding, QuestionAsset

        exam_types = [
            QuestionAsset.AssetType.TRUE_FALSE,
            QuestionAsset.AssetType.SINGLE_CHOICE,
            QuestionAsset.AssetType.MULTIPLE_CHOICE,
            QuestionAsset.AssetType.SHORT_ANSWER,
            QuestionAsset.AssetType.ESSAY,
        ]
        ContestQuestionBinding.objects.filter(
            contest=contest,
            coding_problem__isnull=True,
            legacy_exam_question__isnull=True,
            binding_type__in=exam_types,
        ).delete()

    @staticmethod
    def _normalize_orders(contest):
        questions = list(ExamQuestion.objects.filter(contest=contest).order_by("order", "id"))
        dirty = []
        for index, question in enumerate(questions):
            if question.order != index:
                question.order = index
                dirty.append(question)
        if dirty:
            ExamQuestion.objects.bulk_update(dirty, ["order"])
        return list(ExamQuestion.objects.filter(contest=contest).order_by("order", "id"))

    @staticmethod
    def _sync_exam_bindings(contest, actor):
        questions = ExamQuestion.objects.filter(contest=contest).order_by("order", "id")
        for question in questions:
            ensure_contest_binding_for_exam_question(exam_question=question, actor=actor)

    @action(detail=False, methods=['post'], url_path='import-from-bank')
    def import_from_bank(self, request, contest_pk=None):
        contest = self._get_contest()
        self._ensure_admin_permission(contest)
        ensure_contest_question_editable(
            contest=contest,
            actor_id=getattr(request.user, "id", None),
            action="exam_question.import_from_bank",
        )

        import_mode = "copy"

        items = request.data.get('items', [])
        if not isinstance(items, list) or not items:
            raise DRFValidationError('items must be a non-empty list')

        created_rows = []

        with transaction.atomic():
            # Lock existing rows so concurrent imports / creates can't both
            # observe the same max(order) and produce overlapping inserts.
            current_max_order = (
                ExamQuestion.objects.select_for_update()
                .filter(contest=contest)
                .aggregate(Max('order'))['order__max']
            )
            next_order = (current_max_order if current_max_order is not None else -1) + 1

            for item in items:
                if not isinstance(item, dict):
                    raise DRFValidationError('Invalid item payload')

                question_bank_id = item.get('question_bank_id')
                question_id = item.get('question_id')
                if not question_bank_id or question_id is None:
                    raise DRFValidationError('Each item requires question_bank_id and question_id')

                bank, bank_question = resolve_bank_question_for_import(
                    user=request.user,
                    question_bank_id=question_bank_id,
                    question_id=question_id,
                    allowed_question_types={Question.QuestionType.EXAM},
                )

                prompt = (bank_question.prompt or bank_question.title or "").strip()
                if not prompt:
                    raise DRFValidationError(f'Imported question {bank_question.id} has empty prompt/title')

                exam_question = ExamQuestion.objects.create(
                    contest=contest,
                    question_type=self._normalize_exam_question_type(bank_question),
                    prompt=prompt,
                    options=bank_question.options or [],
                    correct_answer=bank_question.correct_answer,
                    score=max(1, int(bank_question.score or 1)),
                    order=next_order,
                    source_bank_id=bank.uuid,
                    source_bank_name=bank.name,
                    source_question_id=bank_question.id,
                    source_mode=import_mode,
                )
                question_asset, question_version = ensure_question_asset_for_bank_question(
                    question=bank_question,
                    actor=request.user,
                )
                exam_question.question_asset = question_asset
                exam_question.question_version = question_version
                exam_question.save(update_fields=["question_asset", "question_version", "updated_at"])
                ensure_contest_binding_for_exam_question(
                    exam_question=exam_question,
                    actor=request.user,
                )
                created_rows.append(exam_question)
                next_order += 1

        ContestActivityViewSet.log_activity(
            contest,
            request.user,
            'update_problem',
            f"Imported {len(created_rows)} exam questions from bank",
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
        ensure_contest_question_editable(
            contest=contest,
            actor_id=getattr(request.user, "id", None),
            action="exam_question.reorder",
        )

        orders = request.data.get('orders', [])
        if not isinstance(orders, list) or not orders:
            raise DRFValidationError('No orders provided')

        with transaction.atomic():
            # Lock the contest's questions so concurrent reorders can't race;
            # the unique (contest, order) constraint is deferrable so the
            # intermediate updates within this transaction stay legal until
            # the final state is committed.
            ExamQuestion.objects.select_for_update().filter(contest=contest).exists()

            for item in orders:
                question_id = item.get('id')
                new_order = item.get('order')
                if question_id is None or new_order is None:
                    continue
                ExamQuestion.objects.filter(
                    contest=contest, id=question_id
                ).update(order=new_order)

            # Compact gaps so the final state is contiguous 0..N-1.
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
            logger.warning("Paper exam export validation error: %s", exc)
            raise DRFValidationError("Export validation failed")
        except Exception as exc:
            logger.exception("Failed to generate paper exam sheet: %s", exc)
            raise APIException("Failed to generate paper exam sheet")
