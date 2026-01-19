"""
Views for labs app.
"""
from __future__ import annotations

from django.db.models import Max, Count, Q
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.problems.models import Problem
from .access_policy import LabAccessPolicy
from .models import Lab, LabProblem
from .serializers import LabListSerializer, LabDetailSerializer, LabProblemListSerializer


class IsTeacherOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        if view.action in ["list", "retrieve", "list_problems"]:
            return True
        user = request.user
        return user.is_authenticated and (
            user.is_staff or getattr(user, "role", "") in ["admin", "teacher"]
        )


class LabViewSet(viewsets.ModelViewSet):
    """
    ViewSet for labs.
    """
    queryset = Lab.objects.all()
    permission_classes = [permissions.IsAuthenticated, IsTeacherOrAdmin]
    ordering = ["-created_at"]

    def get_queryset(self):
        queryset = super().get_queryset().select_related("owner").annotate(
            problem_count=Count("lab_problems", distinct=True)
        )
        user = self.request.user
        scope = self.request.query_params.get("scope")
        role = getattr(user, "role", "")

        if self.action in ["update", "partial_update", "destroy", "add_problem", "remove_problem"]:
            if not user.is_staff and role != "admin":
                return queryset.filter(owner=user)

        if user.is_staff or role in ["admin", "teacher"]:
            if scope == "mine":
                return queryset.filter(owner=user)
            if scope == "public":
                return queryset.filter(is_published=True)
            return queryset.filter(Q(is_published=True) | Q(owner=user))

        return queryset.filter(is_published=True)

    def get_serializer_class(self):
        if self.action == "list":
            return LabListSerializer
        return LabDetailSerializer

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def _ensure_manager(self, lab: Lab) -> Response | None:
        if LabAccessPolicy.is_manager(self.request.user, lab):
            return None
        return Response(
            {"error": "You do not have permission to manage this lab."},
            status=status.HTTP_403_FORBIDDEN,
        )

    @action(detail=True, methods=["get", "post"], url_path="problems")
    def list_or_add_problems(self, request, pk=None):
        lab = self.get_object()
        if request.method.lower() == "get":
            if not LabAccessPolicy.can_view(request.user, lab):
                return Response(
                    {"error": "You do not have permission to view this lab."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            lab_problems = LabProblem.objects.filter(lab=lab).select_related("problem").order_by(
                "order",
                "id",
            )
            serializer = LabProblemListSerializer(lab_problems, many=True, context=self.get_serializer_context())
            return Response(serializer.data)

        # POST -> add problem
        error_response = self._ensure_manager(lab)
        if error_response:
            return error_response

        problem_id = request.data.get("problem_id")
        if not problem_id:
            return Response({"error": "problem_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            problem = Problem.objects.get(pk=problem_id)
        except Problem.DoesNotExist:
            return Response({"error": "Problem not found"}, status=status.HTTP_404_NOT_FOUND)

        if LabProblem.objects.filter(lab=lab, problem=problem).exists():
            return Response({"error": "Problem already in lab"}, status=status.HTTP_400_BAD_REQUEST)

        order = request.data.get("order")
        if order is None:
            max_order = LabProblem.objects.filter(lab=lab).aggregate(max_order=Max("order"))
            order = (max_order["max_order"] or 0) + 1
        else:
            try:
                order = int(order)
            except (TypeError, ValueError):
                return Response({"error": "order must be an integer"}, status=status.HTTP_400_BAD_REQUEST)

        lab_problem = LabProblem.objects.create(lab=lab, problem=problem, order=order)
        serializer = LabProblemListSerializer(lab_problem, context=self.get_serializer_context())
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"problems/(?P<problem_id>\d+)")
    def remove_problem(self, request, pk=None, problem_id=None):
        lab = self.get_object()
        error_response = self._ensure_manager(lab)
        if error_response:
            return error_response

        deleted, _ = LabProblem.objects.filter(lab=lab, problem_id=problem_id).delete()
        if deleted == 0:
            return Response({"error": "Problem not found in lab"}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)
