"""AI Chat API views."""

import logging

from rest_framework import status, viewsets, generics, serializers
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied

from .models import AIMessage, AISession
from .services.session_runtime import (
    ChatStreamRuntime,
    ResumeStreamRuntime,
    build_sse_response,
    submit_pending_answer,
)
from .serializers import (
    AISessionListSerializer,
    AISessionSerializer,
    ModelInfoSerializer,
    RenameSessionSerializer,
    SendMessageStreamSerializer,
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

    @action(detail=True, methods=["post"])
    def send_message_stream(self, request, pk=None):
        """Send a message and stream AI response (proxied to ai-service).

        設計說明：
        - 所有 session 必須與認證用戶關聯
        - pk 可以是：
          - 現存 session_id（Claude SDK session ID）- 恢復現存會話
          - backend_session_id（新會話的 UUID）- 新會話（需要初始化）
          - 'new' 特殊值（向後相容）- 新會話
        - 不支持匿名會話

        Request body:
        - content: str (required) - The message content
        - skill: str (optional) - Skill to use for this message
        - model: str (optional) - Model to use: 'haiku', 'sonnet', 'opus' (default: 'haiku')
        - reference: object (optional) - Problem reference context
        """
        # 必須認證
        if not request.user or not request.user.is_authenticated:
            return Response(
                {"error": "Authentication required"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # 獲取或創建 session
        session = None

        # pk 可以是現存 session_id 或新會話的 backend_session_id
        # 嘗試查詢現存會話
        try:
            session = AISession.objects.get(session_id=pk, user=request.user)
            logger.debug(f"Found existing session {pk} for user {request.user.id}")
        except AISession.DoesNotExist:
            if AISession.objects.filter(session_id=pk).exists():
                return Response(
                    {"error": "Session not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )
            # pk 不存在於資料庫，可能是新會話的 backend_session_id
            logger.debug(f"Session {pk} not found - will create new session for user {request.user.id}")
            session = None

        serializer = SendMessageStreamSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        content = serializer.validated_data["content"]
        skill = serializer.validated_data.get("skill")

        if skill and not (
            request.user.is_staff
            or getattr(request.user, "role", "") in ("teacher", "admin")
        ):
            return Response(
                {"error": "Only teacher/admin can use skill override"},
                status=status.HTTP_403_FORBIDDEN,
            )

        runtime = ChatStreamRuntime(
            user=request.user,
            backend_session_id=pk,
            session=session,
            content=content,
            validated_data=serializer.validated_data,
            skill=skill,
        )
        return build_sse_response(runtime.generate())

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
        """Clear all messages in a session."""
        session = self.get_object()
        session.messages.all().delete()

        # Clear session context but keep title
        title = session.context.get("title") if session.context else None
        session.context = {"title": title} if title else {}
        session.save(update_fields=["context", "updated_at"])

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

    @action(detail=True, methods=["post"])
    def submit_answer(self, request, pk=None):
        """Submit user's answer to a pending AskUserQuestion request.

        Request body:
        - request_id: str (required) - The request ID from the user_input_request event
        - answers: dict (required) - Mapping of question text to selected option label(s)

        This endpoint forwards the answer to the AI Service, which will resume
        the blocked chat_stream.
        """
        self.get_object()

        request_id = request.data.get("request_id")
        answers = request.data.get("answers")

        if not request_id:
            return Response(
                {"error": "request_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not answers or not isinstance(answers, dict):
            return Response(
                {"error": "answers must be a non-empty dictionary"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            return Response(submit_pending_answer(request_id, answers))

        except Exception as e:
            logger.exception(f"Error submitting user answer: {e}")
            return Response(
                {"error": "Failed to submit answer"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

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

    @action(detail=True, methods=["post"])
    def resume_stream(self, request, pk=None):
        """Resume an interrupted agent and stream the result.

        Proxies to ai-service /api/chat/resume endpoint.

        Request body:
        - decision: str (required) - "approve" or "reject"
        """
        if not request.user or not request.user.is_authenticated:
            return Response(
                {"error": "Authentication required"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        decision = request.data.get("decision")
        if decision not in ("approve", "reject"):
            return Response(
                {"error": "decision must be 'approve' or 'reject'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Look up existing session
        try:
            session = AISession.objects.get(session_id=pk, user=request.user)
        except AISession.DoesNotExist:
            return Response(
                {"error": "Session not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        runtime = ResumeStreamRuntime(
            user=request.user,
            session=session,
            decision=decision,
        )
        return build_sse_response(runtime.generate())



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
            "description": "推理能力強，支援 thinking",
            "is_default": True,
        },
    ]

    def get(self, request):
        return Response({"models": self.MODELS})
