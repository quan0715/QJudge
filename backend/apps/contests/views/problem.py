"""ContestProblemViewSet."""
from django.utils import timezone
from django.db.models import Sum
from rest_framework import viewsets, permissions, status
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
from .activity import ContestActivityViewSet


class ContestProblemViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for retrieving contest problems.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ContestProblemSerializer

    def get_queryset(self):
        contest_id = self.kwargs.get('contest_pk')
        return ContestProblem.objects.filter(contest_id=contest_id).select_related('problem').annotate(
            problem_score_sum=Sum('problem__test_cases__score')
        )

    def retrieve(self, request, *args, **kwargs):
        contest_id = self.kwargs.get('contest_pk')
        problem_id = self.kwargs.get('pk')

        try:
            # We look up by problem_id (the Problem's ID), not ContestProblem's ID
            contest_problem = ContestProblem.objects.get(
                contest_id=contest_id,
                problem_id=problem_id
            )
        except ContestProblem.DoesNotExist:
            # Try looking up by ContestProblem ID as a fallback
            try:
                contest_problem = ContestProblem.objects.get(
                    contest_id=contest_id,
                    id=problem_id
                )
            except ContestProblem.DoesNotExist:
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
        data['score'] = contest_problem.problem.test_cases.aggregate(Sum('score'))['score__sum'] or 0
        data['label'] = contest_problem.label
        data['contest_problem_id'] = contest_problem.id

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

        # Use ProblemAdminSerializer to create the problem
        from apps.problems.serializers import ProblemAdminSerializer

        # Ensure contest-created problem is not exposed in practice list.
        data = request.data.copy()
        data['visibility'] = 'private'

        serializer = ProblemAdminSerializer(data=data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        # Save with created_in_contest
        problem = serializer.save(created_in_contest=contest)

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
            order=next_order
        )

        # Return the created problem data with contest_id for navigation
        response_data = serializer.data
        response_data['contest_id'] = contest.id

        ContestActivityViewSet.log_activity(
            contest,
            request.user,
            'update_problem',
            f"Created new problem {problem.display_id} in contest"
        )

        return Response(response_data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        """
        Remove a problem from the contest.
        """
        contest_id = self.kwargs.get('contest_pk')
        problem_id = self.kwargs.get('pk')  # This is the problem_id (not ContestProblem id)

        contest = get_object_or_404(Contest, pk=contest_id)
        user = request.user

        if not can_manage_contest(user, contest):
             return Response(
                {'detail': 'Permission denied.'},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            try:
                contest_problem = ContestProblem.objects.get(
                    contest=contest,
                    problem_id=problem_id
                )
            except ContestProblem.DoesNotExist:
                contest_problem = ContestProblem.objects.get(
                    contest=contest,
                    id=problem_id
                )

            # Delete the relationship
            problem_display_id = contest_problem.problem.display_id
            contest_problem.delete()

            ContestActivityViewSet.log_activity(
                contest,
                request.user,
                'update_problem',
                f"Removed problem {problem_display_id} from contest"
            )

            return Response(status=status.HTTP_204_NO_CONTENT)

        except ContestProblem.DoesNotExist:
            return Response(
                {'detail': 'Problem not found in this contest.'},
                status=status.HTTP_404_NOT_FOUND
            )
