"""ContestExamQuestionViewSet."""
import hashlib
import json
import logging
from uuid import UUID

from django.db import transaction
from django.utils import timezone
from django.db.models import Max
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, NotFound, PermissionDenied, ValidationError as DRFValidationError
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from apps.question_bank.models import Question, QuestionBank
from apps.question_bank.question_assets import (
    ensure_contest_binding_for_exam_question,
    ensure_question_asset_for_bank_question,
)
from apps.question_bank.bank_workflows import is_publicly_accessible_bank

from ..models import (
    Contest,
    ContestProblem,
    ExamQuestion,
    ExamQuestionImportSession,
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
from ..services.question_edit_lock import ensure_contest_question_editable
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
    IMPORT_MODES = {
        ExamQuestionImportSession.ImportMode.APPEND,
        ExamQuestionImportSession.ImportMode.REPLACE_ALL,
        ExamQuestionImportSession.ImportMode.REPLACE_MANUAL_ONLY,
    }

    @staticmethod
    def _normalize_uuid(value, *, field_name: str) -> str:
        try:
            return str(UUID(str(value)))
        except (TypeError, ValueError):
            raise DRFValidationError({field_name: "Must be a valid UUID."})

    def _get_contest(self):
        contest_pk = self.kwargs.get('contest_pk')
        return get_object_or_404(Contest, pk=contest_pk)

    def _is_admin(self, contest):
        return can_manage_contest(self.request.user, contest)

    def _ensure_admin_permission(self, contest):
        if not self._is_admin(contest):
            raise PermissionDenied('Only contest owner/admin can manage exam questions')

    def _resolve_bank_question_for_import(self, *, user, question_bank_id, question_id):
        normalized_bank_uuid = self._normalize_uuid(
            question_bank_id, field_name="question_bank_id"
        )

        bank = QuestionBank.objects.filter(uuid=normalized_bank_uuid, is_archived=False).first()
        if not bank:
            raise NotFound("Question bank not found")

        if bank.owner_id != user.id and not is_publicly_accessible_bank(bank):
            raise PermissionDenied("No access to this question bank")

        normalized_question_uuid = self._normalize_uuid(
            question_id, field_name="question_id"
        )

        # Primary lookup: QuestionBankMembership (bank_item_id from frontend)
        from apps.question_bank.models import QuestionBankMembership
        from apps.question_bank.write_workflows import materialize_bank_question_adapter_for_membership

        membership = (
            QuestionBankMembership.objects.filter(
                bank=bank, id=normalized_question_uuid,
            )
            .select_related("question_asset", "question_asset__latest_version", "legacy_question")
            .first()
        )

        if membership:
            if membership.legacy_question_id:
                question = membership.legacy_question
            else:
                question = materialize_bank_question_adapter_for_membership(
                    membership=membership, actor=user,
                )
        else:
            # Legacy fallback: direct Question ID
            question = Question.objects.filter(
                bank=bank,
                id=normalized_question_uuid,
                question_type=Question.QuestionType.EXAM,
            ).first()

        if not question:
            raise NotFound("Question not found in bank")

        return bank, question

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
        ensure_contest_question_editable(
            contest=contest,
            actor_id=getattr(self.request.user, "id", None),
            action="exam_question.create",
        )
        if 'order' not in self.request.data:
            last_order = ExamQuestion.objects.filter(contest=contest).aggregate(Max('order'))['order__max']
            serializer.save(contest=contest, order=(last_order if last_order is not None else -1) + 1)
            ensure_contest_binding_for_exam_question(
                exam_question=serializer.instance,
                actor=self.request.user,
            )
            return

        serializer.save(contest=contest)
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
        ensure_contest_question_editable(
            contest=contest,
            actor_id=getattr(self.request.user, "id", None),
            action="exam_question.update",
        )
        serializer.save()
        ensure_contest_binding_for_exam_question(
            exam_question=serializer.instance,
            actor=self.request.user,
        )

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

    def _extract_import_payload(self, request):
        payload_json = request.data.get("payload_json")
        if isinstance(payload_json, str):
            try:
                parsed_payload = json.loads(payload_json)
            except json.JSONDecodeError as exc:
                raise DRFValidationError(f"Invalid payload_json: {exc.msg}")
        elif isinstance(payload_json, dict):
            parsed_payload = payload_json
        else:
            raise DRFValidationError("payload_json must be a JSON string or object")

        if not isinstance(parsed_payload, dict):
            raise DRFValidationError("payload_json root must be an object")

        if parsed_payload.get("version") != "qjudge.exam.v1":
            raise DRFValidationError('payload_json.version must be "qjudge.exam.v1"')

        meta = parsed_payload.get("meta")
        if not isinstance(meta, dict):
            raise DRFValidationError("payload_json.meta must be an object")

        questions_data = parsed_payload.get("questions")
        if not isinstance(questions_data, list) or not questions_data:
            raise DRFValidationError("payload_json.questions must be a non-empty list")

        serializer = ExamQuestionSerializer(data=questions_data, many=True)
        if not serializer.is_valid():
            raise DRFValidationError(serializer.errors)

        return parsed_payload, serializer.validated_data

    @staticmethod
    def _build_import_fingerprint(import_mode: str, payload: dict) -> str:
        canonical = json.dumps(
            {"import_mode": import_mode, "payload_json": payload},
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    @staticmethod
    def _serialize_exam_questions_snapshot(queryset):
        rows = []
        for question in queryset.order_by("order", "id"):
            rows.append(
                {
                    "id": str(question.id),
                    "question_type": question.question_type,
                    "prompt": question.prompt,
                    "options": question.options or [],
                    "correct_answer": question.correct_answer,
                    "score": int(question.score),
                    "order": int(question.order),
                    "source_bank_id": str(question.source_bank_id) if question.source_bank_id else None,
                    "source_bank_name": question.source_bank_name or "",
                    "source_question_id": str(question.source_question_id) if question.source_question_id else None,
                    "source_mode": question.source_mode or ContestProblem.SourceMode.MANUAL,
                    "question_asset_id": str(question.question_asset_id) if question.question_asset_id else None,
                    "question_version_id": str(question.question_version_id) if question.question_version_id else None,
                }
            )
        return rows

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

    def _build_preview_summary(self, *, contest, import_mode: str, incoming_items_count: int, incoming_score: int):
        existing_qs = ExamQuestion.objects.filter(contest=contest)
        existing_count = existing_qs.count()
        existing_score = sum(q.score for q in existing_qs)
        delete_count = 0
        keep_count = existing_count
        keep_score = existing_score

        if import_mode == ExamQuestionImportSession.ImportMode.REPLACE_ALL:
            delete_count = existing_count
            keep_count = 0
            keep_score = 0
        elif import_mode == ExamQuestionImportSession.ImportMode.REPLACE_MANUAL_ONLY:
            replace_qs = existing_qs.filter(
                source_mode__in=[
                    ContestProblem.SourceMode.MANUAL,
                    ContestProblem.SourceMode.JSON,
                ]
            )
            delete_count = replace_qs.count()
            keep_count = existing_count - delete_count
            keep_score = existing_score - sum(q.score for q in replace_qs)

        final_score = keep_score + incoming_score
        return {
            "mode": import_mode,
            "will_add": incoming_items_count,
            "will_delete": delete_count,
            "will_keep": keep_count,
            "score_before": existing_score,
            "score_after": final_score,
            "score_delta": final_score - existing_score,
        }

    @action(detail=False, methods=["post"], url_path="import/preview")
    def import_preview(self, request, contest_pk=None):
        contest = self._get_contest()
        self._ensure_admin_permission(contest)
        ensure_contest_question_editable(
            contest=contest,
            actor_id=getattr(request.user, "id", None),
            action="exam_question.import_preview",
        )

        import_mode = request.data.get("import_mode", ExamQuestionImportSession.ImportMode.APPEND)
        if import_mode not in self.IMPORT_MODES:
            raise DRFValidationError("import_mode is invalid")

        parsed_payload, validated_questions = self._extract_import_payload(request)

        incoming_score = sum(int(item.get("score", 0)) for item in validated_questions)
        summary = self._build_preview_summary(
            contest=contest,
            import_mode=import_mode,
            incoming_items_count=len(validated_questions),
            incoming_score=incoming_score,
        )
        fingerprint = self._build_import_fingerprint(import_mode, parsed_payload)
        return Response(
            {
                "summary": summary,
                "fingerprint": fingerprint,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["post"], url_path="import/apply")
    def import_apply(self, request, contest_pk=None):
        contest = self._get_contest()
        self._ensure_admin_permission(contest)
        ensure_contest_question_editable(
            contest=contest,
            actor_id=getattr(request.user, "id", None),
            action="exam_question.import_apply",
        )

        import_mode = request.data.get("import_mode", ExamQuestionImportSession.ImportMode.APPEND)
        if import_mode not in self.IMPORT_MODES:
            raise DRFValidationError("import_mode is invalid")

        parsed_payload, validated_questions = self._extract_import_payload(request)

        expected_fingerprint = request.data.get("fingerprint")
        calculated_fingerprint = self._build_import_fingerprint(import_mode, parsed_payload)
        if expected_fingerprint and expected_fingerprint != calculated_fingerprint:
            exc = APIException("fingerprint mismatch")
            exc.status_code = 409
            raise exc

        incoming_score = sum(int(item.get("score", 0)) for item in validated_questions)
        preview_summary = self._build_preview_summary(
            contest=contest,
            import_mode=import_mode,
            incoming_items_count=len(validated_questions),
            incoming_score=incoming_score,
        )

        with transaction.atomic():
            before_snapshot = self._serialize_exam_questions_snapshot(
                ExamQuestion.objects.filter(contest=contest)
            )

            if import_mode == ExamQuestionImportSession.ImportMode.REPLACE_ALL:
                ExamQuestion.objects.filter(contest=contest).delete()
            elif import_mode == ExamQuestionImportSession.ImportMode.REPLACE_MANUAL_ONLY:
                ExamQuestion.objects.filter(
                    contest=contest,
                    source_mode__in=[
                        ContestProblem.SourceMode.MANUAL,
                        ContestProblem.SourceMode.JSON,
                    ],
                ).delete()

            existing_after_deletion = self._normalize_orders(contest)
            next_order = len(existing_after_deletion)

            create_allowed_fields = {
                "question_type",
                "prompt",
                "options",
                "correct_answer",
                "score",
            }
            new_questions = []
            for item_data in validated_questions:
                sanitized_data = {
                    key: value
                    for key, value in item_data.items()
                    if key in create_allowed_fields
                }
                new_questions.append(
                    ExamQuestion(
                        contest=contest,
                        order=next_order,
                        source_mode=ContestProblem.SourceMode.JSON,
                        **sanitized_data,
                    )
                )
                next_order += 1

            if new_questions:
                ExamQuestion.objects.bulk_create(new_questions)

            self._cleanup_orphan_exam_bindings(contest)
            self._sync_exam_bindings(contest, request.user)
            after_snapshot = self._serialize_exam_questions_snapshot(
                ExamQuestion.objects.filter(contest=contest)
            )

            session = ExamQuestionImportSession.objects.create(
                contest=contest,
                actor=request.user,
                import_mode=import_mode,
                before_snapshot=before_snapshot,
                after_snapshot=after_snapshot,
                summary=preview_summary,
            )

        ContestActivityViewSet.log_activity(
            contest,
            request.user,
            "update_problem",
            f"Applied exam import ({import_mode}) with {preview_summary['will_add']} questions",
        )

        serialized = self.get_serializer(
            ExamQuestion.objects.filter(contest=contest).order_by("order", "id"),
            many=True,
        )
        return Response(
            {
                "session_id": str(session.id),
                "applied_summary": preview_summary,
                "questions": serialized.data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"], url_path="import/rollback")
    def import_rollback(self, request, contest_pk=None):
        contest = self._get_contest()
        self._ensure_admin_permission(contest)
        ensure_contest_question_editable(
            contest=contest,
            actor_id=getattr(request.user, "id", None),
            action="exam_question.import_rollback",
        )
        session_id = request.data.get("session_id")
        if not session_id:
            raise DRFValidationError("session_id is required")

        session = ExamQuestionImportSession.objects.filter(contest=contest, id=session_id).first()
        if not session:
            raise NotFound("import session not found")

        with transaction.atomic():
            ExamQuestion.objects.filter(contest=contest).delete()
            restore_rows = session.before_snapshot if isinstance(session.before_snapshot, list) else []
            restored = []
            for row in restore_rows:
                if not isinstance(row, dict):
                    continue
                restored.append(
                    ExamQuestion(
                        id=row.get("id"),
                        contest=contest,
                        question_type=row.get("question_type", ExamQuestionType.ESSAY),
                        prompt=row.get("prompt", ""),
                        options=row.get("options") or [],
                        correct_answer=row.get("correct_answer"),
                        score=max(1, int(row.get("score") or 1)),
                        order=max(0, int(row.get("order") or 0)),
                        source_bank_id=row.get("source_bank_id"),
                        source_bank_name=row.get("source_bank_name") or "",
                        source_question_id=row.get("source_question_id"),
                        source_mode=row.get("source_mode") or ContestProblem.SourceMode.MANUAL,
                        question_asset_id=row.get("question_asset_id"),
                        question_version_id=row.get("question_version_id"),
                    )
                )

            if restored:
                ExamQuestion.objects.bulk_create(restored)

            self._normalize_orders(contest)
            self._cleanup_orphan_exam_bindings(contest)
            self._sync_exam_bindings(contest, request.user)

        ContestActivityViewSet.log_activity(
            contest,
            request.user,
            "update_problem",
            f"Rolled back exam import session {session.id}",
        )
        return Response(
            {
                "rolled_back": True,
                "restored_count": len(restored),
                "session_id": str(session.id),
            },
            status=status.HTTP_200_OK,
        )

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

        current_max_order = ExamQuestion.objects.filter(contest=contest).aggregate(Max('order'))['order__max']
        next_order = (current_max_order if current_max_order is not None else -1) + 1
        created_rows = []

        with transaction.atomic():
            for item in items:
                if not isinstance(item, dict):
                    raise DRFValidationError('Invalid item payload')

                question_bank_id = item.get('question_bank_id')
                question_id = item.get('question_id')
                if not question_bank_id or question_id is None:
                    raise DRFValidationError('Each item requires question_bank_id and question_id')

                bank, bank_question = self._resolve_bank_question_for_import(
                    user=request.user,
                    question_bank_id=question_bank_id,
                    question_id=question_id,
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
            logger.warning("Paper exam export validation error: %s", exc)
            raise DRFValidationError("Export validation failed")
        except Exception as exc:
            logger.exception("Failed to generate paper exam sheet: %s", exc)
            raise APIException("Failed to generate paper exam sheet")
