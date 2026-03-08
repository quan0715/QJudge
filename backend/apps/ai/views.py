"""AI Chat API views."""

import logging

from django.db import transaction
from rest_framework import status, viewsets, generics, serializers
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied

from django.utils import timezone

from .models import AIMessage, AIPendingAction, AISession
from .permissions import IsInternalService
from .services.pending_actions import execute_create_action, execute_patch_action
from .services.session_runtime import (
    ChatStreamRuntime,
    ResumeStreamRuntime,
    build_sse_response,
    get_active_user_api_key,
    submit_pending_answer,
)
from .serializers import (
    AISessionListSerializer,
    AISessionSerializer,
    CodeRunRequestSerializer,
    CommitActionSerializer,
    ModelInfoSerializer,
    PendingActionSerializer,
    PrepareActionSerializer,
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

        # 取得使用者的 API Key（若有設定）
        user_api_key = get_active_user_api_key(request.user)
        if not user_api_key:
            return Response(
                {"error": "請先在設定頁面設定您的 API Key"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 獲取或創建 session
        session = None

        # pk 可以是現存 session_id 或新會話的 backend_session_id
        # 嘗試查詢現存會話
        if pk != 'new':  # 特殊值 'new' 表示新會話
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
            user_api_key=user_api_key,
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
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

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

        # 取得使用者的 API Key（若有設定）
        user_api_key = get_active_user_api_key(request.user)
        if not user_api_key:
            return Response(
                {"error": "請先在設定頁面設定您的 API Key"},
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
            user_api_key=user_api_key,
        )
        return build_sse_response(runtime.generate())

    # ================================================================
    # v2 Actions
    # ================================================================

    @action(detail=True, methods=["get"], url_path="pending-actions/active")
    def pending_actions_active(self, request, pk=None):
        """Get active pending action for this session (for page refresh recovery)."""
        session = self.get_object()
        action_obj = (
            AIPendingAction.objects
            .filter(session=session, status=AIPendingAction.Status.PENDING)
            .order_by("-created_at")
            .first()
        )
        if action_obj is None:
            return Response({"active_action": None})

        # Lazy expiry check
        if action_obj.is_expired():
            action_obj.status = AIPendingAction.Status.EXPIRED
            action_obj.save(update_fields=["status"])
            return Response({"active_action": None})

        return Response({"active_action": PendingActionSerializer(action_obj).data})

    @action(detail=True, methods=["post"], url_path="actions/(?P<action_id>[^/.]+)/confirm")
    def confirm_action(self, request, pk=None, action_id=None):
        """Confirm a pending action. Commit happens on next prompt (v2.2 protocol)."""
        session = self.get_object()

        try:
            with transaction.atomic():
                action_obj = (
                    AIPendingAction.objects
                    .select_for_update()
                    .get(id=action_id, session=session)
                )

                # Idempotent: already confirmed/executed
                if action_obj.status in (AIPendingAction.Status.CONFIRMED, AIPendingAction.Status.EXECUTED):
                    return Response(PendingActionSerializer(action_obj).data)

                if action_obj.status != AIPendingAction.Status.PENDING:
                    return Response(
                        {"error": f"Action is {action_obj.status}, cannot confirm."},
                        status=status.HTTP_409_CONFLICT,
                    )

                # Lazy expiry
                if action_obj.is_expired():
                    action_obj.status = AIPendingAction.Status.EXPIRED
                    action_obj.save(update_fields=["status"])
                    return Response(
                        {"error": "Action has expired."},
                        status=status.HTTP_410_GONE,
                    )

                action_obj.status = AIPendingAction.Status.CONFIRMED
                action_obj.save(update_fields=["status"])

                # Update session context
                session.context = session.context or {}
                session.context["active_pending_action_id"] = str(action_obj.id)
                session.save(update_fields=["context", "updated_at"])

        except AIPendingAction.DoesNotExist:
            return Response(
                {"error": "Action not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(PendingActionSerializer(action_obj).data)

    @action(detail=True, methods=["post"], url_path="actions/(?P<action_id>[^/.]+)/cancel")
    def cancel_action(self, request, pk=None, action_id=None):
        """Cancel a pending action."""
        session = self.get_object()

        try:
            with transaction.atomic():
                action_obj = (
                    AIPendingAction.objects
                    .select_for_update()
                    .get(id=action_id, session=session)
                )

                # Idempotent
                if action_obj.status == AIPendingAction.Status.CANCELLED:
                    return Response(PendingActionSerializer(action_obj).data)

                if action_obj.status not in (AIPendingAction.Status.PENDING, AIPendingAction.Status.CONFIRMED):
                    return Response(
                        {"error": f"Action is {action_obj.status}, cannot cancel."},
                        status=status.HTTP_409_CONFLICT,
                    )

                action_obj.status = AIPendingAction.Status.CANCELLED
                action_obj.save(update_fields=["status"])

                # Clear session pending
                session.context = session.context or {}
                session.context.pop("active_pending_action_id", None)
                session.save(update_fields=["context", "updated_at"])

        except AIPendingAction.DoesNotExist:
            return Response(
                {"error": "Action not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(PendingActionSerializer(action_obj).data)


# ============================================================
# Model List (Public)
# ============================================================

class ModelListView(SchemaAPIView):
    """GET /api/v1/ai/models/ — return available model options."""

    permission_classes = [IsAuthenticated]
    serializer_class = ModelInfoSerializer

    MODELS = [
        {
            "model_id": "claude-haiku",
            "display_name": "Claude Haiku",
            "description": "快速、低成本",
            "is_default": False,
        },
        {
            "model_id": "claude-sonnet",
            "display_name": "Claude Sonnet",
            "description": "平衡效能與成本",
            "is_default": True,
        },
        {
            "model_id": "claude-opus",
            "display_name": "Claude Opus",
            "description": "最強推理能力",
            "is_default": False,
        },
    ]

    def get(self, request):
        return Response({"models": self.MODELS})


# ============================================================
# Internal API (HMAC-protected, for ai-service tool calls)
# ============================================================

class InternalPrepareActionView(SchemaAPIView):
    """POST /api/v1/ai/internal/problem-actions/prepare

    Called by ai-service tool: creates AIPendingAction with preview.
    """

    permission_classes = [IsInternalService]
    serializer_class = PrepareActionSerializer

    def post(self, request):
        serializer = PrepareActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        session_id = serializer.validated_data["session_id"]
        user_id = serializer.validated_data["user_id"]
        action_type = serializer.validated_data["action_type"]
        payload = serializer.validated_data["payload"]

        # Resolve session and user
        try:
            session = AISession.objects.get(session_id=session_id)
        except AISession.DoesNotExist:
            return Response(
                {"error": f"Session {session_id} not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response(
                {"error": f"User {user_id} not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Build preview (for now, preview = payload; can be enriched later)
        preview = payload
        target_problem_id = payload.get("target_problem_id") if action_type == "patch" else None

        # Create pending action
        action_obj = AIPendingAction.objects.create(
            session=session,
            user=user,
            action_type=action_type,
            target_problem_id=target_problem_id,
            payload=payload,
            preview=preview,
            expires_at=timezone.now() + timezone.timedelta(minutes=30),
        )

        # Update session context
        session.context = session.context or {}
        session.context["active_pending_action_id"] = str(action_obj.id)
        session.save(update_fields=["context", "updated_at"])

        return Response({
            "action_id": str(action_obj.id),
            "preview": preview,
            "validation_issues": [],  # TODO: add validation in future
        }, status=status.HTTP_201_CREATED)


class InternalCommitActionView(SchemaAPIView):
    """POST /api/v1/ai/internal/problem-actions/commit

    Called by ai-service tool after user confirms.
    Executes the actual create/patch with transaction safety.
    """

    permission_classes = [IsInternalService]
    serializer_class = CommitActionSerializer

    def post(self, request):
        serializer = CommitActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        action_id = serializer.validated_data["action_id"]

        try:
            with transaction.atomic():
                action_obj = (
                    AIPendingAction.objects
                    .select_for_update()
                    .get(id=action_id)
                )

                # Idempotent: already executed
                if action_obj.status == AIPendingAction.Status.EXECUTED:
                    return Response({
                        "status": "already_executed",
                        "problem_id": action_obj.executed_problem.id if action_obj.executed_problem else None,
                    })

                if action_obj.status != AIPendingAction.Status.CONFIRMED:
                    return Response(
                        {"error": f"Action status is {action_obj.status}, expected confirmed."},
                        status=status.HTTP_409_CONFLICT,
                    )

                # Execute based on action type
                try:
                    if action_obj.action_type == AIPendingAction.ActionType.CREATE:
                        problem = execute_create_action(action_obj)
                    else:
                        problem = execute_patch_action(action_obj)

                    action_obj.status = AIPendingAction.Status.EXECUTED
                    action_obj.executed_problem = problem
                    action_obj.save(update_fields=["status", "executed_problem"])

                    # Clear session pending
                    session = action_obj.session
                    session.context = session.context or {}
                    session.context.pop("active_pending_action_id", None)
                    session.context["last_executed_problem_id"] = problem.id
                    session.save(update_fields=["context", "updated_at"])

                    return Response({
                        "status": "executed",
                        "problem_id": problem.id,
                    })

                except Exception as exc:
                    action_obj.status = AIPendingAction.Status.FAILED
                    action_obj.error_message = str(exc)
                    action_obj.save(update_fields=["status", "error_message"])
                    logger.exception("Commit action failed: %s", exc)
                    return Response(
                        {"error": str(exc)},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    )

        except AIPendingAction.DoesNotExist:
            return Response(
                {"error": "Action not found."},
                status=status.HTTP_404_NOT_FOUND,
            )


class InternalPendingActionDetailView(SchemaAPIView):
    """GET /api/v1/ai/internal/pending-actions/{action_id}

    Returns pending action details (for ai-service to build approval preview).
    """

    permission_classes = [IsInternalService]
    serializer_class = PendingActionSerializer

    def get(self, request, action_id):
        try:
            action_obj = AIPendingAction.objects.get(id=action_id)
        except AIPendingAction.DoesNotExist:
            return Response(
                {"error": "Action not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response({
            "action_id": str(action_obj.id),
            "action_type": action_obj.action_type,
            "status": action_obj.status,
            "preview": action_obj.preview or {},
            "payload": action_obj.payload or {},
            "target_problem_id": action_obj.target_problem_id,
            "created_at": action_obj.created_at.isoformat(),
        })


class InternalProblemContextView(SchemaAPIView):
    """GET /api/v1/ai/internal/problems/{id}/context

    Returns problem data for agent to read.
    """

    permission_classes = [IsInternalService]
    serializer_class = serializers.Serializer

    def get(self, request, problem_id):
        from apps.problems.models import Problem
        try:
            problem = Problem.objects.get(id=problem_id)
        except Problem.DoesNotExist:
            return Response(
                {"error": "Problem not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Build all translations
        translations_data = [
            {
                "language": t.language,
                "title": t.title,
                "description": t.description,
                "input_description": t.input_description,
                "output_description": t.output_description,
                "hint": t.hint or "",
            }
            for t in problem.translations.order_by("language")
        ]

        # Sample test cases only
        sample_cases = [
            {"input": tc.input_data, "output": tc.output_data, "order": tc.order}
            for tc in problem.test_cases.filter(is_sample=True).order_by("order")
        ]

        return Response({
            "id": problem.id,
            "title": problem.title,
            "difficulty": problem.difficulty,
            "time_limit": problem.time_limit,
            "memory_limit": problem.memory_limit,
            "translations": translations_data,
            "sample_test_cases": sample_cases,
        })


class InternalTestCasesView(SchemaAPIView):
    """GET /api/v1/ai/internal/problems/{id}/test-cases

    Returns ALL test cases (sample + hidden) for a problem.
    """

    permission_classes = [IsInternalService]
    serializer_class = serializers.Serializer

    def get(self, request, problem_id):
        from apps.problems.models import Problem, TestCase
        try:
            problem = Problem.objects.get(id=problem_id)
        except Problem.DoesNotExist:
            return Response(
                {"error": "Problem not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        cases = TestCase.objects.filter(problem=problem).order_by("order")
        return Response({
            "problem_id": problem.id,
            "test_cases": [
                {
                    "id": tc.id,
                    "input_data": tc.input_data,
                    "output_data": tc.output_data,
                    "is_sample": tc.is_sample,
                    "is_hidden": tc.is_hidden,
                    "score": tc.score,
                    "order": tc.order,
                }
                for tc in cases
            ],
        })


class InternalCodeRunView(SchemaAPIView):
    """POST /api/v1/ai/internal/code/run

    Execute code against test cases in a sandbox.
    Returns per-case results and a summary.
    """

    permission_classes = [IsInternalService]
    serializer_class = CodeRunRequestSerializer

    def post(self, request):
        serializer = CodeRunRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        code = serializer.validated_data["code"]
        language = serializer.validated_data["language"]
        test_cases = serializer.validated_data["test_cases"]
        time_limit = serializer.validated_data["time_limit"]
        memory_limit = serializer.validated_data["memory_limit"]

        # Enforce limits
        if len(test_cases) > 20:
            return Response(
                {"error": "Maximum 20 test cases per request."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.judge.judge_factory import get_judge

        try:
            judge = get_judge(language)
        except ValueError as exc:
            return Response(
                {"error": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        results = []
        passed = 0
        failed = 0

        for tc in test_cases:
            input_data = tc["input"]
            expected_output = tc["expected_output"]

            result = judge.execute(
                code=code,
                input_data=input_data,
                expected_output=expected_output,
                time_limit=time_limit,
                memory_limit=memory_limit,
            )

            result["input"] = input_data
            result["expected_output"] = expected_output
            results.append(result)

            if result["status"] == "AC":
                passed += 1
            else:
                failed += 1

            # Stop on CE (compilation error) — no point running more cases
            if result["status"] == "CE":
                break

        return Response({
            "results": results,
            "summary": {
                "passed": passed,
                "failed": failed,
                "total": len(test_cases),
                "ran": len(results),
            },
        })
