"""
URL configuration for problems app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProblemViewSet,
    TagViewSet,
    ProblemDiscussionListCreateView,
    ProblemDiscussionDetailView,
    ProblemDiscussionCommentListCreateView,
    ProblemDiscussionCommentDetailView,
    DiscussionLikeView,
    CommentLikeView,
)

app_name = 'problems'

router = DefaultRouter()
router.register(r'tags', TagViewSet, basename='tag')
router.register(r'', ProblemViewSet, basename='problem')

urlpatterns = [
    path('', include(router.urls)),
    # Discussion endpoints
    # GET/POST /api/v1/problems/{problem_id}/discussions/
    path(
        '<int:problem_id>/discussions/',
        ProblemDiscussionListCreateView.as_view(),
        name='problem-discussion-list',
    ),
    # GET/PATCH/DELETE /api/v1/problems/problem-discussions/{id}/
    path(
        'problem-discussions/<int:pk>/',
        ProblemDiscussionDetailView.as_view(),
        name='problem-discussion-detail',
    ),
    # POST /api/v1/problems/problem-discussions/{id}/like/
    path(
        'problem-discussions/<int:pk>/like/',
        DiscussionLikeView.as_view(),
        name='problem-discussion-like',
    ),
    # GET/POST /api/v1/problems/problem-discussions/{id}/comments/
    path(
        'problem-discussions/<int:discussion_id>/comments/',
        ProblemDiscussionCommentListCreateView.as_view(),
        name='problem-discussion-comment-list',
    ),
    # PATCH/DELETE /api/v1/problems/problem-discussion-comments/{id}/
    path(
        'problem-discussion-comments/<int:pk>/',
        ProblemDiscussionCommentDetailView.as_view(),
        name='problem-discussion-comment-detail',
    ),
    # POST /api/v1/problems/problem-discussion-comments/{id}/like/
    path(
        'problem-discussion-comments/<int:pk>/like/',
        CommentLikeView.as_view(),
        name='problem-discussion-comment-like',
    ),
]
