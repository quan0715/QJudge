"""ContestProblemViewSet -- reads and writes via ContestQuestionBinding."""
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
    ExamStatus,
)
from ..serializers import ContestProblemSerializer
from ..permissions import can_manage_contest
from ..services.question_edit_lock import ensure_contest_question_editable
from .activity import ContestActivityViewSet
from apps.question_bank.models import ContestQuestionBinding, QuestionAsset


class ContestProblemViewSet(viewsets.ModelViewSet):
    """
    ViewSet for contest coding problems.
    Primary model is ContestQuestionBinding.
    Supports: list, retrieve, create, update (partial), destroy.
    """
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ContestProblemSerializer

    def get_queryset(self):
        contest_id = self.kwargs.get('contest_pk')
        from django.db.models import Exists, OuterRef
        from apps.question_bank.models import QuestionBankMembership
        return (
            ContestQuestionBinding.objects.filter(
                contest_id=contest_id,
                binding_type=QuestionAsset.AssetType.CODING,
            )
            .select_related('coding_problem', 'question_asset', 'question_version')
            .annotate(
                _in_question_bank=Exists(
                    QuestionBankMembership.objects.filter(
                        question_asset_id=OuterRef('question_asset_id'),
                    )
                ),
            )
            .order_by('order')
        )

    def _resolve_binding(self, *, contest_id, lookup_value):
        """Resolve a binding strictly by binding UUID."""
        import uuid as _uuid

        lookup_str = str(lookup_value)
        try:
            _uuid.UUID(lookup_str)
        except (ValueError, AttributeError):
            return None

        return (
            ContestQuestionBinding.objects.filter(
                contest_id=contest_id,
                binding_type=QuestionAsset.AssetType.CODING,
                id=lookup_str,
            )
            .select_related('coding_problem', 'question_asset', 'question_version')
            .first()
        )

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
            from apps.question_bank.question_assets import ensure_problem_question_asset
            ensure_problem_question_asset(problem=problem, actor=user)
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

        response_data = serializer.data
        response_data['contest_id'] = contest.id
        response_data['binding_id'] = str(binding.id)

        ContestActivityViewSet.log_activity(
            contest, user, 'update_problem',
            f"Created new problem {problem.id} in contest",
        )
        return Response(response_data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        """Update a coding problem within the contest (partial update)."""
        contest_id = self.kwargs.get('contest_pk')
        lookup_value = self.kwargs.get('pk')
        contest = get_object_or_404(Contest, pk=contest_id)
        user = request.user

        if not can_manage_contest(user, contest):
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        ensure_contest_question_editable(
            contest=contest, actor_id=getattr(user, "id", None), action="contest_problem.update",
        )

        binding = self._resolve_binding(contest_id=contest.id, lookup_value=lookup_value)
        if not binding:
            return Response({'detail': 'Problem not found in this contest.'}, status=status.HTTP_404_NOT_FOUND)

        problem = binding.coding_problem
        if not problem:
            return Response({'detail': 'Coding problem not linked.'}, status=status.HTTP_404_NOT_FOUND)

        from apps.problems.serializers import ProblemAdminSerializer
        serializer = ProblemAdminSerializer(problem, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # Sync question asset after update
        from apps.question_bank.question_assets import ensure_problem_question_asset
        ensure_problem_question_asset(problem=problem, actor=user)
        problem.refresh_from_db()

        if problem.question_asset_id and problem.question_version_id:
            ContestQuestionBinding.objects.filter(pk=binding.pk).update(
                question_version=problem.question_version,
            )

        response_data = serializer.data
        response_data['binding_id'] = str(binding.id)

        ContestActivityViewSet.log_activity(
            contest, user, 'update_problem',
            f"Updated problem {problem.id} in contest",
        )
        return Response(response_data)

    def partial_update(self, request, *args, **kwargs):
        """PATCH support — delegates to update with partial=True."""
        return self.update(request, *args, **kwargs)

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

        label = str(binding.question_asset.title) if binding.question_asset else str(binding.coding_problem_id or binding.question_asset_id)
        question_asset = binding.question_asset
        coding_problem = binding.coding_problem

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

        title = str(binding.question_asset.title) if binding.question_asset else str(binding.coding_problem_id or binding.question_asset_id)
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

        from apps.contests.services.contest_problem_service import (
            resolve_bank_question_for_import,
            materialize_problem_from_bank_item,
        )

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

                bank, bank_item = resolve_bank_question_for_import(
                    user=user,
                    question_bank_id=question_bank_id,
                    question_id=question_id,
                    allowed_question_types={"coding"},
                    invalid_type_message="Only coding bank questions can be imported here",
                )

                problem = materialize_problem_from_bank_item(
                    contest=contest, bank_item=bank_item, user=user, request=request,
                )

                if not problem.question_asset_id:
                    from apps.question_bank.question_assets import ensure_problem_question_asset
                    ensure_problem_question_asset(problem=problem, actor=user)
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
                    source_question_id=bank_item.id,
                    source_mode="copy",
                    created_by=user,
                )

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

    @action(detail=False, methods=["post"], url_path="duplicate")
    def duplicate(self, request, *args, **kwargs):
        """Clone an existing coding problem within the contest."""
        contest_id = self.kwargs.get("contest_pk")
        contest = get_object_or_404(Contest, pk=contest_id)
        user = request.user

        if not can_manage_contest(user, contest):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        ensure_contest_question_editable(
            contest=contest, actor_id=getattr(user, "id", None), action="contest_problem.duplicate",
        )

        problem_id = request.data.get("problem_id")
        if not problem_id:
            raise DRFValidationError("problem_id is required")

        from apps.problems.models import CodingProblem
        source = CodingProblem.objects.filter(id=problem_id).first()
        if not source:
            return Response({"detail": "Problem not found"}, status=status.HTTP_404_NOT_FOUND)

        from apps.problems.services import ProblemService
        problem = ProblemService.clone_problem(source, contest, user)

        if not problem.question_asset_id:
            from apps.question_bank.question_assets import ensure_problem_question_asset
            ensure_problem_question_asset(problem=problem, actor=user)
            problem.refresh_from_db(fields=["question_asset", "question_version"])

        last_order = ContestQuestionBinding.objects.filter(
            contest=contest, binding_type=QuestionAsset.AssetType.CODING,
        ).aggregate(max_order=Max("order"))["max_order"]
        next_order = (last_order if last_order is not None else -1) + 1

        default_max_score = max(1, int(problem.test_cases.aggregate(total=Sum("score"))["total"] or 100))
        requested = request.data.get("max_score")
        max_score = max(1, int(requested)) if requested is not None else default_max_score

        binding = ContestQuestionBinding.objects.create(
            contest=contest, question_asset=problem.question_asset,
            question_version=problem.question_version, coding_problem=problem,
            binding_type=QuestionAsset.AssetType.CODING,
            order=next_order, score=max_score, source_mode="copy", created_by=user,
        )

        ContestActivityViewSet.log_activity(
            contest, user, "update_problem", f"Duplicated problem {source.id}",
        )

        from apps.problems.serializers import ProblemListSerializer
        data = ProblemListSerializer(problem, context={"request": request}).data
        data["binding_id"] = str(binding.id)
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="reorder")
    def reorder(self, request, *args, **kwargs):
        """Reorder coding problems. Payload: {"orders": [{"id": "...", "order": N}, ...]}"""
        contest_id = self.kwargs.get("contest_pk")
        contest = get_object_or_404(Contest, pk=contest_id)
        user = request.user

        if not can_manage_contest(user, contest):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        ensure_contest_question_editable(
            contest=contest, actor_id=getattr(user, "id", None), action="contest_problem.reorder",
        )

        orders = request.data.get("orders", [])
        if not orders:
            raise DRFValidationError("No orders provided")

        import uuid as _uuid
        for item in orders:
            item_id = item.get("id")
            new_order = item.get("order")
            if item_id is None or new_order is None:
                continue
            item_str = str(item_id)
            try:
                _uuid.UUID(item_str)
                is_uuid = True
            except (ValueError, AttributeError):
                is_uuid = False

            if is_uuid:
                ContestQuestionBinding.objects.filter(
                    contest=contest, id=item_str,
                ).update(order=new_order)

        # Normalize to sequential 0, 1, 2...
        bindings = ContestQuestionBinding.objects.filter(
            contest=contest, binding_type=QuestionAsset.AssetType.CODING,
        ).order_by("order", "created_at")
        for i, b in enumerate(bindings):
            if b.order != i:
                b.order = i
                b.save(update_fields=["order", "updated_at"])
        ContestActivityViewSet.log_activity(contest, user, "update_problem", "Reordered coding problems")
        return Response({"status": "reordered"})
