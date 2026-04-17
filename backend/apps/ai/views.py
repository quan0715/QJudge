"""AI Chat API views."""

import logging

from rest_framework import status, viewsets, generics, serializers
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied

from .models import AIChatRun, AIMessage, AISession
from .services.stream_response import build_sse_response
from .serializers import (
    AIChatRunSerializer,
    AISessionListSerializer,
    AISessionSerializer,
    ModelInfoSerializer,
    RenameSessionSerializer,
    RunApprovalSerializer,
    StartRunSerializer,
)
from .services.run_runtime import (
    ACTIVE_STATUSES,
    create_chat_run,
    ensure_session_for_run,
    request_run_cancel,
    resume_approval_run,
    run_events_as_sse,
)

logger = logging.getLogger(__name__)


class SchemaAPIView(generics.GenericAPIView):
    """APIView with serializer support for schema generation."""

    serializer_class = serializers.Serializer


class AISessionViewSet(viewsets.ModelViewSet):
    """ViewSet for AI chat sessions."""

    permission_classes = [IsAuthenticated]
    serializer_class = AISessionSerializer

    def get_queryset(self):
        """Return sessions.

        認證用戶: 只返回其自己的 session
        匿名用戶: 不允許列表查詢（無持久化 session）
        """
        if self.request.user and self.request.user.is_authenticated:
            return AISession.objects.filter(user=self.request.user).prefetch_related(
                "messages"
            )
        # 匿名用戶返回空 queryset（不支持列表查詢）
        return AISession.objects.none()

    def get_serializer_class(self):
        if self.action == "list":
            return AISessionListSerializer
        return AISessionSerializer

    def perform_create(self, serializer):
        """Create a new session for the current user."""
        serializer.save(user=self.request.user)

    @action(detail=False, methods=["post"])
    def new_session(self, request):
        """Create a new session placeholder before first message.

        此 endpoint 用於前端建立新會話時獲取一個後端 session ID。
        實際的 AISession 會在發送第一條訊息時才建立。

        Returns:
            {
                "id": "backend-session-id",
                "status": "pending"
            }
        """
        import uuid

        # 生成一個臨時的 backend session ID（用於前端識別）
        backend_session_id = str(uuid.uuid4())

        return Response({
            "id": backend_session_id,
            "status": "pending",
        })

    @action(detail=True, methods=["post"], url_path="runs")
    def runs(self, request, pk=None):
        """Create a durable backend-controlled chat run for a session."""
        if not request.user or not request.user.is_authenticated:
            return Response(
                {"error": "Authentication required"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        serializer = StartRunSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            session = ensure_session_for_run(user=request.user, session_id=pk)
        except AISession.DoesNotExist:
            return Response({"error": "Session not found"}, status=status.HTTP_404_NOT_FOUND)

        run = create_chat_run(
            user=request.user,
            session=session,
            content=serializer.validated_data["content"],
            model_id=serializer.validated_data["model_id"],
        )
        status_code = status.HTTP_202_ACCEPTED if run.status == AIChatRun.Status.QUEUED else status.HTTP_201_CREATED
        return Response(AIChatRunSerializer(run).data, status=status_code)

    @action(detail=True, methods=["post"])
    def rename(self, request, pk=None):
        """Rename a session."""
        session = self.get_object()

        serializer = RenameSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        title = serializer.validated_data["title"]

        session.context = session.context or {}
        session.context["title"] = title
        session.save(update_fields=["context", "updated_at"])

        return Response(AISessionListSerializer(session).data)

    @action(detail=True, methods=["post"])
    def clear(self, request, pk=None):
        """Clear all messages in a session and delete the LangGraph checkpoint.

        Deletes both Django messages and the LangGraph checkpoint state so broken
        threads (e.g. dangling tool_calls) are fully reset on the next message.
        """
        import httpx
        from .services.stream_proxy import ai_service_base_url, build_ai_service_headers

        session = self.get_object()
        session.messages.all().delete()

        # Clear session context but keep title
        title = session.context.get("title") if session.context else None
        session.context = {"title": title} if title else {}
        session.save(update_fields=["context", "updated_at"])

        # Delete LangGraph checkpoint so broken state is fully wiped
        try:
            ai_headers = build_ai_service_headers(request.user)
            httpx.delete(
                f"{ai_service_base_url()}/api/chat/thread/{session.session_id}",
                headers=ai_headers,
                timeout=10.0,
            )
        except Exception as e:
            logger.warning("Failed to delete LangGraph thread %s: %s", session.session_id, e)

        # Add welcome message
        AIMessage.objects.create(
            session=session,
            role=AIMessage.Role.ASSISTANT,
            content="你好！我是 QJudge AI 助教，有什麼可以幫助你的嗎？",
            message_type=AIMessage.MessageType.TEXT,
        )

        return Response(AISessionSerializer(session).data)

    @action(detail=True, methods=["get"])
    def context(self, request, pk=None):
        """Get session context (for debugging/inspection)."""
        session = self.get_object()
        return Response({
            "session_id": session.session_id,
            "context": session.context or {},
        })

    def destroy(self, request, *args, **kwargs):
        """Delete a session (only authenticated users can delete their own sessions)."""
        session = self.get_object()

        # Only authenticated users can delete sessions
        if not request.user or not request.user.is_authenticated:
            raise PermissionDenied("Authentication required to delete sessions")

        # Only the session owner can delete it
        if session.user != request.user:
            raise PermissionDenied("You do not have permission to delete this session")

        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["get"], url_path="credit")
    def credit(self, request):
        """GET /api/v1/ai/sessions/credit/ — return current user's AI usage."""
        from .models import UserAICredit
        credit_obj, _ = UserAICredit.objects.get_or_create(user=request.user)
        return Response({
            "total_input_tokens": credit_obj.total_input_tokens,
            "total_output_tokens": credit_obj.total_output_tokens,
            "total_requests": credit_obj.total_requests,
            "total_cost_cents": credit_obj.total_cost_cents,
            "total_cost_usd": str(credit_obj.total_cost_usd),
            "updated_at": credit_obj.updated_at,
        })


class AIChatRunViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for durable AI chat runs."""

    permission_classes = [IsAuthenticated]
    serializer_class = AIChatRunSerializer

    def get_queryset(self):
        queryset = AIChatRun.objects.filter(user=self.request.user).select_related(
            "session",
            "user_message",
            "assistant_message",
        )
        if self.request.query_params.get("status") == "active":
            queryset = queryset.filter(status__in=ACTIVE_STATUSES)
        return queryset

    @action(detail=True, methods=["get"])
    def events(self, request, pk=None):
        """Subscribe to persisted events for a durable run."""
        run = self.get_object()
        try:
            after = int(request.query_params.get("after", "0"))
        except ValueError:
            after = 0
        return build_sse_response(run_events_as_sse(run=run, after=after))

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Request cancellation for a durable run."""
        run = self.get_object()
        request_run_cancel(run)
        run.refresh_from_db()
        return Response(AIChatRunSerializer(run).data)

    @action(detail=True, methods=["post"])
    def approval(self, request, pk=None):
        """Submit approval/rejection for an awaiting durable run."""
        run = self.get_object()
        serializer = RunApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            run = resume_approval_run(
                run=run,
                decision=serializer.validated_data["decision"],
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_409_CONFLICT)
        return Response(AIChatRunSerializer(run).data)



# ============================================================
# Model List (Public)
# ============================================================

class ModelListView(SchemaAPIView):
    """GET /api/v1/ai/models/ — return available model options."""

    permission_classes = [IsAuthenticated]
    serializer_class = ModelInfoSerializer

    MODELS = [
        {
            "model_id": "deepseek-r1",
            "display_name": "DeepSeek R1",
            "description": "推理能力強，適合複雜操作與測資生成",
            "is_default": True,
        },
        {
            "model_id": "deepseek-v3",
            "display_name": "DeepSeek V3",
            "description": "快速，適合簡單查詢",
            "is_default": False,
        },
    ]

    def get(self, request):
        return Response({"models": self.MODELS})
