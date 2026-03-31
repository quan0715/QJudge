"""ContestProblemViewSet."""
from django.utils import timezone
from django.db.models import Sum
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
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
from apps.question_bank.question_assets import ensure_contest_binding_for_problem


class ContestProblemViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for retrieving contest problems.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ContestProblemSerializer

    def get_queryset(self):
        contest_id = self.kwargs.get('contest_pk')
        return ContestProblem.objects.filter(contest_id=contest_id).select_related(
            'problem',
            'question_binding',
        )

    def _resolve_contest_problem(self, *, contest_id, lookup_value):
        lookup_str = str(lookup_value)
        if lookup_str.isdigit():
            contest_problem = ContestProblem.objects.filter(
                contest_id=contest_id,
                id=int(lookup_str),
            ).select_related('problem', 'question_binding').first()
            if contest_problem:
                return contest_problem

        return ContestProblem.objects.filter(
            contest_id=contest_id,
            problem_id=lookup_value,
        ).select_related('problem', 'question_binding').first()

    def retrieve(self, request, *args, **kwargs):
        contest_id = self.kwargs.get('contest_pk')
        lookup_value = self.kwargs.get('pk')
        contest_problem = self._resolve_contest_problem(
            contest_id=contest_id,
            lookup_value=lookup_value,
        )
        if not contest_problem:
            return Response(
                {'detail': 'Problem not found in this contest.'},
                status=status.HTTP_404_NOT_FOUND
            )

        contest = contest_problem.contest
        user = request.user

        # Privileged users (platform_admin / owner / co_owner) can always view problem details
        is_privileged = can_manage_contest(user, contest)

        if not is_privileged:
            # Check if registered
            try:
                participant = ContestParticipant.objects.get(contest=contest, user=user)
            except ContestParticipant.DoesNotExist:
                return Response(
                    {'detail': 'You are not registered for this contest.'},
                    status=status.HTTP_403_FORBIDDEN
                )

            # Must have started exam to view problems
            if not participant.started_at and participant.exam_status != ExamStatus.SUBMITTED:
                return Response(
                    {'detail': 'You must start the contest to view problems.'},
                    status=status.HTTP_403_FORBIDDEN
                )

            # Check contest time - only allow access during contest period
            now = timezone.now()

            # Block if contest is draft
            if contest.status == 'draft':
                return Response(
                    {'detail': 'Contest is not published.'},
                    status=status.HTTP_403_FORBIDDEN
                )

            # Block if contest hasn't started
            if contest.start_time and now < contest.start_time:
                return Response(
                    {'detail': 'Contest has not started yet.'},
                    status=status.HTTP_403_FORBIDDEN
                )

            # Allow read-only access after contest ends

        # Serialize the problem with full details
        from apps.problems.serializers import ProblemDetailSerializer
        problem = contest_problem.problem
        serializer = ProblemDetailSerializer(problem, context={'request': request})
        data = serializer.data

        # Add contest-specific fields
        data['score'] = contest_problem.max_score
        data['max_score'] = contest_problem.max_score
        data['label'] = contest_problem.label
        data['contest_problem_id'] = contest_problem.id
        data['source_bank'] = (
            {
                'id': str(contest_problem.source_bank_id),
                'name': contest_problem.source_bank_name or '',
            }
            if contest_problem.source_bank_id
            else None
        )
        data['source_question_id'] = contest_problem.source_question_id
        data['source_mode'] = contest_problem.source_mode
        data['binding_id'] = (
            str(contest_problem.question_binding.id)
            if getattr(contest_problem, 'question_binding', None)
            else None
        )

        return Response(data)

    def create(self, request, *args, **kwargs):
        """
        Create a new problem and add it to the contest.
        Used for YAML import or creating new problems directly in contest context.
        """
        contest_id = self.kwargs.get('contest_pk')
        contest = get_object_or_404(Contest, pk=contest_id)
        user = request.user

        if not can_manage_contest(user, contest):
             return Response(
                {'detail': 'Permission denied.'},
                status=status.HTTP_403_FORBIDDEN
            )
        ensure_contest_question_editable(
            contest=contest,
            actor_id=getattr(user, "id", None),
            action="contest_problem.create",
        )

        # Use ProblemAdminSerializer to create the problem
        from apps.problems.serializers import ProblemAdminSerializer

        data = request.data.copy()

        serializer = ProblemAdminSerializer(data=data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        problem = serializer.save()
        # Asset is created inside ProblemService.create_problem_adapter via serializer.save()

        # Calculate next order and label
        last_problem = ContestProblem.objects.filter(contest=contest).order_by('-order').first()
        next_order = (last_problem.order + 1) if last_problem else 0

        # Simple label generation (A, B, C...)
        import string
        if next_order < 26:
            next_label = string.ascii_uppercase[next_order]
        else:
            next_label = f"P{next_order + 1}"

        # Create ContestProblem link
        contest_problem = ContestProblem.objects.create(
            contest=contest,
            problem=problem,
            order=next_order,
            max_score=max(
                1,
                int(
                    problem.test_cases.aggregate(total=Sum('score')).get('total')
                    or 100
                ),
            ),
        )

        # Return the created problem data with contest_id for navigation
        response_data = serializer.data
        response_data['contest_id'] = contest.id

        ContestActivityViewSet.log_activity(
            contest,
            request.user,
            'update_problem',
            f"Created new problem {problem.title or problem.id} in contest"
        )

        return Response(response_data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        """
        Remove a problem from the contest.
        """
        contest_id = self.kwargs.get('contest_pk')
        lookup_value = self.kwargs.get('pk')

        contest = get_object_or_404(Contest, pk=contest_id)
        user = request.user

        if not can_manage_contest(user, contest):
             return Response(
                {'detail': 'Permission denied.'},
                status=status.HTTP_403_FORBIDDEN
            )
        ensure_contest_question_editable(
            contest=contest,
            actor_id=getattr(user, "id", None),
            action="contest_problem.destroy",
        )

        contest_problem = self._resolve_contest_problem(
            contest_id=contest.id,
            lookup_value=lookup_value,
        )
        if not contest_problem:
            return Response(
                {'detail': 'Problem not found in this contest.'},
                status=status.HTTP_404_NOT_FOUND
            )

        problem_label = contest_problem.problem.title or str(contest_problem.problem_id)
        contest_problem.delete()

        ContestActivityViewSet.log_activity(
            contest,
            request.user,
            'update_problem',
            f"Removed problem {problem_label} from contest"
        )

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["patch"], permission_classes=[permissions.IsAuthenticated], url_path="score")
    def update_score(self, request, *args, **kwargs):
        """
        Update contest-level max score assignment for a contest problem.
        This does not modify problem content or test cases.
        """
        contest_id = self.kwargs.get("contest_pk")
        contest_problem_id = self.kwargs.get("pk")

        contest = get_object_or_404(Contest, pk=contest_id)
        if not can_manage_contest(request.user, contest):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        ensure_contest_question_editable(
            contest=contest,
            actor_id=getattr(request.user, "id", None),
            action="contest_problem.update_score",
        )

        contest_problem = ContestProblem.objects.filter(
            contest=contest,
            id=contest_problem_id,
        ).select_related("problem").first()
        if not contest_problem:
            return Response(
                {"detail": "Problem assignment not found in this contest."},
                status=status.HTTP_404_NOT_FOUND,
            )

        raw_max_score = request.data.get("max_score")
        try:
            max_score = int(raw_max_score)
        except (TypeError, ValueError):
            return Response(
                {"error": "max_score must be a positive integer"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if max_score <= 0:
            return Response(
                {"error": "max_score must be a positive integer"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        contest_problem.max_score = max_score
        contest_problem.save(update_fields=["max_score"])
        ContestActivityViewSet.log_activity(
            contest,
            request.user,
            'update_problem',
            f"Updated problem {(contest_problem.problem.title or contest_problem.problem_id)} score to {max_score}",
        )

        return Response(
            {
                "id": contest_problem.id,
                "problem_id": contest_problem.problem_id,
                "max_score": contest_problem.max_score,
                "score": contest_problem.max_score,
            },
            status=status.HTTP_200_OK,
        )
