"""
Views for problems app.
"""
import logging
from uuid import UUID

from rest_framework import viewsets, permissions, status, serializers
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import (
    CodingProblem,
    Tag,
)
from .serializers import (
    TagSerializer,
    TestRunSerializer,
)
from .test_run_service import ProblemTestRunService, TestRunSetupError

logger = logging.getLogger(__name__)


class IsAdminOnly(permissions.BasePermission):
    """Only allow admin users."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and (
            request.user.is_staff or request.user.role == 'admin'
        )


class IsAdminOrTeacherOrTagReadOnly(permissions.BasePermission):
    """Permission for Tag: admin/teacher can write, others read-only. No object-level owner check."""
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.is_authenticated and (
            request.user.is_staff or request.user.role in ['admin', 'teacher']
        )


class ProblemViewSet(viewsets.GenericViewSet):
    """
    Problem-level actions outside a contest route.

    Problems are created and edited through their contest
    (``/contests/{id}/problems/``); only code test runs live here.
    """
    queryset = CodingProblem.objects.all()
    serializer_class = TestRunSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = 'id'

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def test_run(self, request, id=None):
        """
        Execute code against the public sample cases plus the caller's custom
        cases, without creating a submission. Hidden cases only run in a
        formal submission.

        Access uses the same problem and contest policy as formal submissions.
        """
        from django.shortcuts import get_object_or_404
        from rest_framework.exceptions import PermissionDenied

        from apps.contests.models import Contest
        from apps.submissions.access_policy import (
            SubmissionAccessError,
            SubmissionAccessPolicy,
        )

        try:
            UUID(str(id))
        except (TypeError, ValueError):
            raise serializers.ValidationError({"id": "Must be a valid UUID."})

        serializer = TestRunSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        problem = get_object_or_404(CodingProblem, id=id)

        contest_id = serializer.validated_data.get("contest_id")
        contest = get_object_or_404(Contest, id=contest_id) if contest_id else None
        try:
            SubmissionAccessPolicy.enforce_problem_access(request.user, problem, contest)
        except SubmissionAccessError as exc:
            raise PermissionDenied(exc.message) from exc

        custom_test_cases = serializer.validated_data["custom_test_cases"]
        if serializer.validated_data["asynchronous"]:
            from django.conf import settings
            from django.core import signing
            from .tasks import run_problem_test_run

            task = run_problem_test_run.apply_async(
                args=[str(problem.id), serializer.validated_data["language"], serializer.validated_data["code"]],
                kwargs={"report_progress": True, "custom_test_cases": custom_test_cases},
                queue=settings.JUDGE_TEST_RUN_QUEUE,
            )
            token = signing.dumps({"task": task.id, "user": str(request.user.pk), "problem": str(problem.pk)}, salt="test-run")
            total = len(ProblemTestRunService.build_test_cases(problem, custom_test_cases))
            return Response({"run_id": token, "execution_status": "pending", "status": "pending",
                             "total": total, "results": []}, status=202)

        try:
            result = ProblemTestRunService.run_via_worker(
                problem=problem,
                language=serializer.validated_data["language"],
                source_code=serializer.validated_data["code"],
                custom_test_cases=custom_test_cases,
            )
        except TestRunSetupError as exc:
            logger.warning("Test run setup failed with code=%s", exc.code)
            if exc.code == "judge_unavailable":
                return Response(
                    {"error": "Judge system error"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            return Response(
                {"error": "Unsupported language"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(result)
    
    @action(detail=True, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def test_run_status(self, request, id=None):
        from celery.result import AsyncResult
        from django.conf import settings
        from django.core import signing
        from rest_framework.exceptions import NotFound

        try:
            token = signing.loads(request.query_params.get("run_id", ""), salt="test-run",
                                  max_age=settings.JUDGE_TEST_RUN_TIMEOUT + 60)
        except signing.BadSignature:
            raise NotFound("Test run expired or unavailable")
        if token.get("user") != str(request.user.pk) or token.get("problem") != str(id):
            raise NotFound("Test run unavailable")
        task = AsyncResult(token["task"])
        if task.state == "SUCCESS":
            payload = task.result
            if not isinstance(payload, dict) or not payload.get("ok"):
                return Response({"error": "Test run failed"}, status=500)
            return Response({**payload["result"], "execution_status": "complete"})
        if task.state in {"FAILURE", "REVOKED"}:
            return Response({"error": "Test run failed"}, status=500)
        progress = task.info if task.state == "PROGRESS" and isinstance(task.info, dict) else {}
        return Response({**progress, "status": "pending", "execution_status": "judging",
                         "results": progress.get("results", [])})


# TagViewSet - API endpoints for managing tags
class TagViewSet(viewsets.ModelViewSet):
    """ViewSet for viewing and editing tags."""
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    permission_classes = [IsAdminOrTeacherOrTagReadOnly]
    lookup_field = 'slug'

    def get_permissions(self):
        if self.action == 'destroy':
            return [IsAdminOnly()]
        return [IsAdminOrTeacherOrTagReadOnly()]

    def get_queryset(self):
        queryset = super().get_queryset()
        # Optional: filter by name search
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(name__icontains=search)
        return queryset
