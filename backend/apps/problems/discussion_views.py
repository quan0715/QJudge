"""Discussion/comment/like APIs for problems."""

from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, serializers, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from .models import (
    CommentLike,
    DiscussionLike,
    Problem,
    ProblemDiscussion,
    ProblemDiscussionComment,
)
from .serializers import (
    ProblemDiscussionCommentSerializer,
    ProblemDiscussionSerializer,
)


def _can_view_problem(user, problem: Problem) -> bool:
    if problem.visibility == "public":
        return True
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or getattr(user, "role", "") in ["admin", "teacher"]:
        return True
    return problem.created_by_id == user.id


def _is_privileged(user, problem: Problem) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or getattr(user, "role", "") in ["admin", "teacher"]:
        return True
    return problem.created_by_id == user.id


def _require_author(user, owner):
    if user != owner:
        return Response(status=status.HTTP_403_FORBIDDEN)
    return None


def _soft_delete(instance, serializer_cls, request):
    instance.is_deleted = True
    instance.save(update_fields=["is_deleted", "updated_at"])
    return Response(
        serializer_cls(instance, context={"request": request}).data,
        status=status.HTTP_200_OK,
    )


def _toggle_like(model, *, relation_name: str, target, user):
    filters = {relation_name: target, "user": user}
    like, created = model.objects.get_or_create(**filters)
    if not created:
        like.delete()
        return False
    return True


class DiscussionAPIView(generics.GenericAPIView):
    """Base API view with serializer support."""

    serializer_class = serializers.Serializer


class ProblemDiscussionListCreateView(DiscussionAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ProblemDiscussionSerializer

    def get_problem(self, request, problem_id: int) -> Problem:
        problem = get_object_or_404(Problem, id=problem_id)
        if not _can_view_problem(request.user, problem):
            raise PermissionDenied("You do not have access to this problem.")
        return problem

    def get(self, request, problem_id: int):
        problem = self.get_problem(request, problem_id)
        discussions = ProblemDiscussion.objects.filter(problem=problem).select_related("user")
        serializer = ProblemDiscussionSerializer(
            discussions, many=True, context={"request": request}
        )
        return Response(serializer.data)

    def post(self, request, problem_id: int):
        problem = self.get_problem(request, problem_id)
        serializer = ProblemDiscussionSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        discussion = serializer.save(problem=problem, user=request.user)
        return Response(
            ProblemDiscussionSerializer(discussion, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class ProblemDiscussionDetailView(DiscussionAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ProblemDiscussionSerializer

    def get_object(self, request, pk: int) -> ProblemDiscussion:
        discussion = get_object_or_404(
            ProblemDiscussion.objects.select_related("problem", "user"),
            id=pk,
        )
        if not _can_view_problem(request.user, discussion.problem):
            raise PermissionDenied("You do not have access to this problem.")
        return discussion

    def get(self, request, pk: int):
        discussion = self.get_object(request, pk)
        return Response(
            ProblemDiscussionSerializer(discussion, context={"request": request}).data
        )

    def patch(self, request, pk: int):
        discussion = self.get_object(request, pk)
        forbidden = _require_author(request.user, discussion.user)
        if forbidden:
            return forbidden

        serializer = ProblemDiscussionSerializer(
            discussion, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk: int):
        discussion = self.get_object(request, pk)
        if not (request.user == discussion.user or _is_privileged(request.user, discussion.problem)):
            return Response(status=status.HTTP_403_FORBIDDEN)
        return _soft_delete(discussion, ProblemDiscussionSerializer, request)


class ProblemDiscussionCommentListCreateView(DiscussionAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ProblemDiscussionCommentSerializer

    def get_discussion(self, request, discussion_id: int) -> ProblemDiscussion:
        discussion = get_object_or_404(
            ProblemDiscussion.objects.select_related("problem", "user"),
            id=discussion_id,
        )
        if not _can_view_problem(request.user, discussion.problem):
            raise PermissionDenied("You do not have access to this problem.")
        return discussion

    def get(self, request, discussion_id: int):
        discussion = self.get_discussion(request, discussion_id)
        comments = discussion.comments.select_related("user", "parent")
        serializer = ProblemDiscussionCommentSerializer(
            comments, many=True, context={"request": request}
        )
        return Response(serializer.data)

    def post(self, request, discussion_id: int):
        discussion = self.get_discussion(request, discussion_id)
        serializer = ProblemDiscussionCommentSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        parent = serializer.validated_data.get("parent")
        if parent and parent.discussion_id != discussion.id:
            return Response(
                {"detail": "Parent comment does not belong to this discussion."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        comment = serializer.save(discussion=discussion, user=request.user)
        return Response(
            ProblemDiscussionCommentSerializer(comment, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class ProblemDiscussionCommentDetailView(DiscussionAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ProblemDiscussionCommentSerializer

    def get_object(self, request, pk: int) -> ProblemDiscussionComment:
        comment = get_object_or_404(
            ProblemDiscussionComment.objects.select_related("discussion__problem", "user"),
            id=pk,
        )
        if not _can_view_problem(request.user, comment.discussion.problem):
            raise PermissionDenied("You do not have access to this problem.")
        return comment

    def patch(self, request, pk: int):
        comment = self.get_object(request, pk)
        forbidden = _require_author(request.user, comment.user)
        if forbidden:
            return forbidden

        serializer = ProblemDiscussionCommentSerializer(
            comment, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk: int):
        comment = self.get_object(request, pk)
        if not (request.user == comment.user or _is_privileged(request.user, comment.discussion.problem)):
            return Response(status=status.HTTP_403_FORBIDDEN)
        return _soft_delete(comment, ProblemDiscussionCommentSerializer, request)


class DiscussionLikeView(DiscussionAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = serializers.Serializer

    def post(self, request, pk: int):
        discussion = get_object_or_404(
            ProblemDiscussion.objects.select_related("problem"),
            id=pk,
        )
        if not _can_view_problem(request.user, discussion.problem):
            raise PermissionDenied("You do not have access to this problem.")

        is_liked = _toggle_like(
            DiscussionLike,
            relation_name="discussion",
            target=discussion,
            user=request.user,
        )
        return Response(
            {
                "is_liked": is_liked,
                "like_count": discussion.likes.count(),
            },
            status=status.HTTP_200_OK,
        )


class CommentLikeView(DiscussionAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = serializers.Serializer

    def post(self, request, pk: int):
        comment = get_object_or_404(
            ProblemDiscussionComment.objects.select_related("discussion__problem"),
            id=pk,
        )
        if not _can_view_problem(request.user, comment.discussion.problem):
            raise PermissionDenied("You do not have access to this problem.")

        is_liked = _toggle_like(
            CommentLike,
            relation_name="comment",
            target=comment,
            user=request.user,
        )
        return Response(
            {
                "is_liked": is_liked,
                "like_count": comment.likes.count(),
            },
            status=status.HTTP_200_OK,
        )
