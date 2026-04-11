"""ContestProblemViewSet — reads and writes via ContestQuestionBinding."""
from django.db import transaction
from django.utils import timezone
from django.db.models import Max, Sum
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from ..models import (
    Contest,
    ContestParticipant,
    ContestProblem,
    ExamStatus,
)
from ..serializers import ContestProblemSerializer
from ..permissions import can_manage_contest
from ..services.question_edit_lock import ensure_contest_question_editable
from .activity import ContestActivityViewSet
from apps.question_bank.models import ContestQuestionBinding, QuestionAsset


class ContestProblemViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for contest coding problems.
    Primary model is ContestQuestionBinding; ContestProblem is kept as
    a backward-compat dual-write shell.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ContestProblemSerializer

    def get_queryset(self):
        contest_id = self.kwargs.get('contest_pk')
        return (
            ContestQuestionBinding.objects.filter(
                contest_id=contest_id,
                binding_type=QuestionAsset.AssetType.CODING,
            )
            .select_related('coding_problem', 'question_asset', 'question_version')
            .order_by('order')
        )

    def _resolve_binding(self, *, contest_id, lookup_value):
        """Resolve a binding by UUID (binding id, coding_problem id) or legacy integer ContestProblem id."""
        import uuid as _uuid
        lookup_str = str(lookup_value)
        qs = ContestQuestionBinding.objects.filter(
            contest_id=contest_id,
            binding_type=QuestionAsset.AssetType.CODING,
        ).select_related('coding_problem', 'question_asset', 'question_version')

        # Check if it looks like a valid UUID
        is_uuid = True
        try:
            _uuid.UUID(lookup_str)
        except (ValueError, AttributeError):
            is_uuid = False

        if is_uuid:
            # Try binding ID
            binding = qs.filter(id=lookup_str).first()
            if binding:
                return binding
            # Try coding_problem_id
            binding = qs.filter(coding_problem_id=lookup_str).first()
            if binding:
                return binding

        # Try legacy ContestProblem integer ID
        if lookup_str.isdigit():
            binding = qs.filter(legacy_contest_problem_id=int(lookup_str)).first()
            if binding:
                return binding

        return None

    def retrieve(self, request, *args, **kwargs):
        contest_id = self.kwargs.get('contest_pk')
        lookup_value = self.kwargs.get('pk')
        binding = self._resolve_binding(contest_id=contest_id, lookup_value=lookup_value)
        if not binding:
            return Response(
                {'detail': 'Problem not found in this contest.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        contest = binding.contest
        user = request.user
        is_privileged = can_manage_contest(user, contest)

        if not is_privileged:
            try:
                participant = ContestParticipant.objects.get(contest=contest, user=user)
            except ContestParticipant.DoesNotExist:
                return Response(
                    {'detail': 'You are not registered for this contest.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if not participant.started_at and participant.exam_status != ExamStatus.SUBMITTED:
                return Response(
                    {'detail': 'You must start the contest to view problems.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            now = timezone.now()
            if contest.status == 'draft':
                return Response({'detail': 'Contest is not published.'}, status=status.HTTP_403_FORBIDDEN)
            if contest.start_time and now < contest.start_time:
                return Response({'detail': 'Contest has not started yet.'}, status=status.HTTP_403_FORBIDDEN)

        # Serialize CodingProblem detail
        from apps.problems.serializers import ProblemDetailSerializer
        problem = binding.coding_problem
        if not problem:
            return Response({'detail': 'Coding problem not linked.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = ProblemDetailSerializer(problem, context={'request': request})
        data = serializer.data

        # Add binding-level fields
        data['score'] = binding.score
        data['max_score'] = binding.score
        data['label'] = binding.label
        data['contest_problem_id'] = binding.legacy_contest_problem_id or str(binding.id)
        data['binding_id'] = str(binding.id)
        data['source_bank'] = (
            {'id': str(binding.source_bank_id), 'name': binding.source_bank_name or ''}
            if binding.source_bank_id else None
        )
        data['source_question_id'] = binding.source_question_id
        data['source_mode'] = binding.source_mode

        return Response(data)

    def create(self, request, *args, **kwargs):
        """Create a new coding problem and bind it to the contest."""
        contest_id = self.kwargs.get('contest_pk')
        contest = get_object_or_404(Contest, pk=contest_id)
        user = request.user

        if not can_manage_contest(user, contest):
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        ensure_contest_question_editable(
            contest=contest, actor_id=getattr(user, "id", None), action="contest_problem.create",
        )

        from apps.problems.serializers import ProblemAdminSerializer
        data = request.data.copy()
        serializer = ProblemAdminSerializer(data=data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        problem = serializer.save(created_by=user)

        # Ensure asset exists
        if not problem.question_asset_id:
            from apps.question_bank.question_assets import sync_problem_question_asset
            sync_problem_question_asset(problem=problem, actor=user)
            problem.refresh_from_db(fields=["question_asset", "question_version"])

        # Determine next order
        last_order = (
            ContestQuestionBinding.objects.filter(
                contest=contest, binding_type=QuestionAsset.AssetType.CODING,
            ).aggregate(max_order=Max('order'))['max_order']
        )
        next_order = (last_order if last_order is not None else -1) + 1

        max_score = max(1, int(problem.test_cases.aggregate(total=Sum('score'))['total'] or 100))

        # Primary write: ContestQuestionBinding
        binding = ContestQuestionBinding.objects.create(
            contest=contest,
            question_asset=problem.question_asset,
            question_version=problem.question_version,
            coding_problem=problem,
            binding_type=QuestionAsset.AssetType.CODING,
            order=next_order,
            score=max_score,
            source_mode="manual",
            created_by=user,
        )

        # Backward-compat dual-write: ContestProblem (skip auto binding sync)
        cp = ContestProblem(
            contest=contest,
            problem=problem,
            order=next_order,
            max_score=max_score,
            question_asset=problem.question_asset,
            question_version=problem.question_version,
        )
        cp._skip_binding_sync = True
        cp.save()
        binding.legacy_contest_problem = cp
        binding.save(update_fields=['legacy_contest_problem', 'updated_at'])

        response_data = serializer.data
        response_data['contest_id'] = contest.id
        response_data['binding_id'] = str(binding.id)

        ContestActivityViewSet.log_activity(
            contest, user, 'update_problem',
            f"Created new problem {problem.title or problem.id} in contest",
        )
        return Response(response_data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        """Remove a problem from the contest."""
        contest_id = self.kwargs.get('contest_pk')
        lookup_value = self.kwargs.get('pk')
        contest = get_object_or_404(Contest, pk=contest_id)
        user = request.user

        if not can_manage_contest(user, contest):
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        ensure_contest_question_editable(
            contest=contest, actor_id=getattr(user, "id", None), action="contest_problem.destroy",
        )

        binding = self._resolve_binding(contest_id=contest.id, lookup_value=lookup_value)
        if not binding:
            return Response({'detail': 'Problem not found in this contest.'}, status=status.HTTP_404_NOT_FOUND)

        label = binding.coding_problem.title if binding.coding_problem else str(binding.question_asset_id)
        question_asset = binding.question_asset
        coding_problem = binding.coding_problem

        # Delete legacy ContestProblem if exists
        if binding.legacy_contest_problem_id:
            ContestProblem.objects.filter(pk=binding.legacy_contest_problem_id).delete()
        binding.delete()

        # Clean up orphaned asset + problem if no other bindings or bank memberships
        from apps.question_bank.question_assets import cleanup_orphan_asset_if_needed
        cleanup_orphan_asset_if_needed(question_asset, coding_problem=coding_problem)

        ContestActivityViewSet.log_activity(
            contest, user, 'update_problem', f"Removed problem {label} from contest",
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["patch"], permission_classes=[permissions.IsAuthenticated], url_path="score")
    def update_score(self, request, *args, **kwargs):
        """Update contest-level score assignment for a binding."""
        contest_id = self.kwargs.get("contest_pk")
        binding_id = self.kwargs.get("pk")
        contest = get_object_or_404(Contest, pk=contest_id)

        if not can_manage_contest(request.user, contest):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        ensure_contest_question_editable(
            contest=contest, actor_id=getattr(request.user, "id", None), action="contest_problem.update_score",
        )

        binding = self._resolve_binding(contest_id=contest.id, lookup_value=binding_id)
        if not binding:
            return Response({"detail": "Problem not found in this contest."}, status=status.HTTP_404_NOT_FOUND)

        raw_max_score = request.data.get("max_score")
        try:
            max_score = int(raw_max_score)
        except (TypeError, ValueError):
            return Response({"error": "max_score must be a positive integer"}, status=status.HTTP_400_BAD_REQUEST)
        if max_score <= 0:
            return Response({"error": "max_score must be a positive integer"}, status=status.HTTP_400_BAD_REQUEST)

        binding.score = max_score
        binding.save(update_fields=["score", "updated_at"])

        # Sync to legacy ContestProblem
        if binding.legacy_contest_problem_id:
            ContestProblem.objects.filter(pk=binding.legacy_contest_problem_id).update(max_score=max_score)

        title = binding.coding_problem.title if binding.coding_problem else str(binding.question_asset_id)
        ContestActivityViewSet.log_activity(
            contest, request.user, 'update_problem', f"Updated problem {title} score to {max_score}",
        )
        return Response({
            "id": str(binding.id),
            "problem_id": str(binding.coding_problem_id) if binding.coding_problem_id else None,
            "max_score": binding.score,
            "score": binding.score,
        })

    @action(detail=False, methods=["post"], url_path="import-from-bank")
    def import_from_bank(self, request, *args, **kwargs):
        """Batch-import coding problems from a question bank.

        Payload: {"items": [{"question_bank_id": "...", "question_id": "..."}, ...]}
        Same contract as exam-questions/import-from-bank/ for consistency.
        """
        contest_id = self.kwargs.get("contest_pk")
        contest = get_object_or_404(Contest, pk=contest_id)
        user = request.user

        if not can_manage_contest(user, contest):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        ensure_contest_question_editable(
            contest=contest, actor_id=getattr(user, "id", None), action="contest_problem.import_from_bank",
        )

        items = request.data.get("items", [])
        if not isinstance(items, list) or not items:
            raise DRFValidationError("items must be a non-empty list")

        # Delegate to ContestViewSet helpers for bank resolution + materialization
        from .contest import ContestViewSet
        contest_vs = ContestViewSet()
        contest_vs.request = request
        contest_vs.kwargs = {"pk": contest_id}
        contest_vs.format_kwarg = None

        last_order = (
            ContestQuestionBinding.objects.filter(
                contest=contest, binding_type=QuestionAsset.AssetType.CODING,
            ).aggregate(max_order=Max("order"))["max_order"]
        )
        next_order = (last_order if last_order is not None else -1) + 1
        created_bindings = []

        with transaction.atomic():
            for item in items:
                if not isinstance(item, dict):
                    raise DRFValidationError("Invalid item payload")

                question_bank_id = item.get("question_bank_id")
                question_id = item.get("question_id")
                if not question_bank_id or question_id is None:
                    raise DRFValidationError("Each item requires question_bank_id and question_id")

                bank, bank_question, error_response = contest_vs._resolve_bank_question_for_import(
                    user=user, question_bank_id=question_bank_id, question_id=question_id,
                )
                if error_response:
                    raise DRFValidationError(error_response.data)

                problem = contest_vs._materialize_problem_from_bank_question(
                    contest=contest, question=bank_question, user=user, request=request,
                )

                if not problem.question_asset_id:
                    from apps.question_bank.question_assets import sync_problem_question_asset
                    sync_problem_question_asset(problem=problem, actor=user)
                    problem.refresh_from_db(fields=["question_asset", "question_version"])

                default_max_score = max(1, int(problem.test_cases.aggregate(total=Sum("score"))["total"] or 100))
                requested = item.get("max_score")
                max_score = max(1, int(requested)) if requested is not None else default_max_score

                binding = ContestQuestionBinding.objects.create(
                    contest=contest,
                    question_asset=problem.question_asset,
                    question_version=problem.question_version,
                    coding_problem=problem,
                    binding_type=QuestionAsset.AssetType.CODING,
                    order=next_order,
                    score=max_score,
                    source_bank_id=bank.uuid,
                    source_bank_name=bank.name,
                    source_question_id=bank_question.id,
                    source_mode="copy",
                    created_by=user,
                )

                cp = ContestProblem(
                    contest=contest, problem=problem, order=next_order, max_score=max_score,
                    question_asset=problem.question_asset, question_version=problem.question_version,
                    source_bank_id=bank.uuid, source_bank_name=bank.name,
                    source_question_id=bank_question.id, source_mode="copy",
                )
                cp._skip_binding_sync = True
                cp.save()
                binding.legacy_contest_problem = cp
                binding.save(update_fields=["legacy_contest_problem", "updated_at"])

                created_bindings.append(binding)
                next_order += 1

        ContestActivityViewSet.log_activity(
            contest, user, "update_problem",
            f"Imported {len(created_bindings)} coding problems from bank",
        )

        serializer = ContestProblemSerializer(
            self.get_queryset(), many=True, context={"request": request},
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)
