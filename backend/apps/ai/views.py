"""AI Chat API views."""

import asyncio
import json
import logging
import httpx

from django.http import StreamingHttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied

from django.utils import timezone

from .ai_client import MessageType, SessionContext, SessionMode, get_ai_client
from .models import AIExecutionLog, AIMessage, AISession
from .serializers import (
    AIMessageSerializer,
    AISessionListSerializer,
    AISessionSerializer,
    RenameSessionSerializer,
    SendMessageSerializer,
)
from apps.users.models import UserAPIKey

logger = logging.getLogger(__name__)

# System prompt is now managed by AI-Service
# Backend should NOT specify system_prompt; AI-Service decides based on conversation context
# This ensures consistency and centralized management of chat style guidelines


def create_execution_log(user, session, user_message):
    """建立執行紀錄，回傳 log 物件供後續更新

    Args:
        user: 認證用戶或 AnonymousUser
        session: AISession 實例
        user_message: 用戶訊息內容
    """
    # 只在用戶是認證用戶時才設置 user 字段
    log_user = user if user and user.is_authenticated else None
    return AIExecutionLog.objects.create(
        user=log_user,
        session=session,
        user_message=user_message,
        raw_log={},
    )


def complete_execution_log(log, ai_response, raw_log=None, metadata=None):
    """完成執行紀錄"""
    log.ai_response = ai_response
    if raw_log:
        log.raw_log = raw_log
    if metadata:
        log.metadata = metadata
    log.save()


async def generate_session_title(user_message: str, user_api_key: str) -> str:
    """使用 AI 為 session 產生簡短標題。

    使用 Haiku 模型快速產生，避免阻塞主要流程。

    Args:
        user_message: 用戶訊息
        user_api_key: 用戶的 Anthropic API Key

    Returns:
        生成的標題
    """
    client = get_ai_client()

    title_prompt = """根據以下用戶訊息，生成一個簡短的對話標題（5-15 個字）。
標題應該簡潔描述對話主題，不需要引號或標點符號。
只回覆標題本身，不要有任何其他文字。

用戶訊息：
"""
    try:
        result = await client.chat(
            conversation=[{"role": "user", "content": title_prompt + user_message[:500]}],
            max_tokens=50,
            model_override="haiku",  # 使用最快的模型
            user_api_key=user_api_key,  # 傳遞用戶 API Key
        )
        # 清理標題（移除引號、多餘空白）
        title = result.content.strip().strip('"\'')
        # 限制長度
        if len(title) > 50:
            title = title[:47] + "..."
        return title
    except Exception as e:
        logger.warning(f"Failed to generate session title: {e}")
        # 回退到簡單截取
        return user_message[:30] + "..." if len(user_message) > 30 else user_message


def update_session_title_async(session, user_message: str, user_api_key: str):
    """在背景執行 session 標題更新。

    注意：此函數在獨立的 thread 中執行，需使用同步方式操作 Django ORM。

    Args:
        session: AISession 實例
        user_message: 用戶訊息
        user_api_key: 用戶的 Anthropic API Key
    """
    import django
    django.db.connections.close_all()  # 關閉舊連線，避免 thread 間共享問題

    # 在新的 event loop 中執行 async AI 呼叫
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        title = loop.run_until_complete(generate_session_title(user_message, user_api_key))
    finally:
        loop.close()

    # 使用同步方式更新資料庫（在新連線中）
    try:
        from .models import AISession
        # 重新從資料庫取得 session 以避免 stale data
        db_session = AISession.objects.get(pk=session.pk)
        db_session.context = db_session.context or {}
        db_session.context["title"] = title
        db_session.save(update_fields=["context", "updated_at"])
        logger.info(f"Session {session.pk} title updated to: {title}")
    except Exception as e:
        logger.error(f"Failed to update session title: {e}")


class AISessionViewSet(viewsets.ModelViewSet):
    """ViewSet for AI chat sessions."""

    permission_classes = [AllowAny]  # Allow all by default, require auth on specific actions
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
        # Only authenticated users can create persistent sessions through API
        if not self.request.user.is_authenticated:
            raise PermissionDenied("Authentication required to create sessions")

        user = self.request.user

        # Deactivate other active sessions
        AISession.objects.filter(user=user, is_active=True).update(is_active=False)

        serializer.save(user=user)

    def _get_session_context(self, session) -> SessionContext:
        """Build SessionContext from session's stored context."""
        ctx = session.context or {}
        return SessionContext(
            claude_session_id=ctx.get("claude_session_id"),
            current_stage=ctx.get("current_stage"),
            current_skill=ctx.get("current_skill"),
            gate_data=ctx.get("gate_data"),
            custom_data=ctx.get("custom_data"),
        )

    def _save_session_context(self, session, ctx: SessionContext):
        """Save SessionContext to session's context field."""
        session.context = session.context or {}
        session.context["claude_session_id"] = ctx.claude_session_id
        session.context["current_stage"] = ctx.current_stage
        session.context["current_skill"] = ctx.current_skill
        if ctx.gate_data:
            session.context["gate_data"] = ctx.gate_data
        if ctx.custom_data:
            session.context["custom_data"] = ctx.custom_data
        session.save(update_fields=["context", "updated_at"])

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
    def send_message(self, request, pk=None):
        """Send a message and get AI response (non-streaming).

        Request body:
        - content: str (required) - The message content
        - skill: str (optional) - Skill to use for this message
        - session_mode: str (optional) - 'new', 'resume', or 'auto' (default)
        - model: str (optional) - Model to use: 'haiku', 'sonnet', 'opus' (default: 'haiku')
        - reference: object (optional) - Problem reference context
        """
        session = self.get_object()

        # ===== 檢查用戶 API Key =====
        try:
            user_api_key_obj = request.user.api_key
            if not user_api_key_obj.is_active:
                return Response({
                    'success': False,
                    'error': {
                        'code': 'API_KEY_INACTIVE',
                        'message': '您的 API Key 已停用，請到設定頁面更新。'
                    }
                }, status=status.HTTP_400_BAD_REQUEST)
        except UserAPIKey.DoesNotExist:
            return Response({
                'success': False,
                'error': {
                    'code': 'API_KEY_REQUIRED',
                    'message': '尚未設定 API Key。請到設定頁面新增您的 Anthropic API Key。',
                    'action_url': '/settings'
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        # 解密 API Key
        user_api_key = user_api_key_obj.get_key()
        # ===== API Key 檢查結束 =====

        serializer = SendMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        content = serializer.validated_data["content"]
        skill = serializer.validated_data.get("skill")
        session_mode_str = serializer.validated_data.get("session_mode", "auto")
        model = serializer.validated_data.get("model", "haiku")
        reference = serializer.validated_data.get("reference")

        # Parse session mode
        try:
            session_mode = SessionMode(session_mode_str)
        except ValueError:
            session_mode = SessionMode.AUTO

        # Check if this is the first message (for auto-naming)
        is_first_message = session.messages.count() == 0

        # Save user message
        user_message = AIMessage.objects.create(
            session=session,
            role=AIMessage.Role.USER,
            content=content,
            message_type=AIMessage.MessageType.TEXT,
        )

        # Auto-generate session title for first message
        if is_first_message and not session.context.get("title"):
            import threading
            threading.Thread(
                target=update_session_title_async,
                args=(session, content, user_api_key),
                daemon=True,
            ).start()

        # Create execution log
        log = create_execution_log(
            user=request.user,
            session=session,
            user_message=content,
        )

        # Get AI response
        try:
            client = get_ai_client()

            # Build conversation history
            history = self._build_conversation_history(session)
            conversation = history + [{"role": "user", "content": content}]

            # Get current session context
            session_ctx = self._get_session_context(session)

            # Run async query in sync context
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                result = loop.run_until_complete(
                    client.chat(
                        conversation=conversation,
                        # system_prompt is now managed by AI-Service
                        skill=skill,
                        session_mode=session_mode,
                        session_context=session_ctx,
                        model_override=model,
                        reference=reference,
                        user_api_key=user_api_key,  # 傳遞用戶 API Key
                    )
                )
            finally:
                loop.close()

            # Save updated session context
            self._save_session_context(session, result.session_context)

            # Complete execution log
            complete_execution_log(
                log=log,
                ai_response=result.content,
                metadata=result.metadata,
            )

            # Save assistant message
            assistant_message = AIMessage.objects.create(
                session=session,
                role=AIMessage.Role.ASSISTANT,
                content=result.content,
                message_type=AIMessage.MessageType.TEXT,
                metadata=result.metadata,
            )

            return Response(
                {
                    "user_message": AIMessageSerializer(user_message).data,
                    "assistant_message": AIMessageSerializer(assistant_message).data,
                    "session_context": result.session_context.to_dict(),
                }
            )

        except Exception as e:
            logger.exception(f"Error getting AI response: {e}")
            # Complete execution log with error
            complete_execution_log(
                log=log,
                ai_response=None,
                metadata={"error": str(e)},
            )
            # Save error message
            error_message = AIMessage.objects.create(
                session=session,
                role=AIMessage.Role.ASSISTANT,
                content="抱歉，AI 服務暫時無法使用，請稍後再試。",
                message_type=AIMessage.MessageType.ERROR,
                metadata={"error": str(e)},
            )
            return Response(
                {
                    "user_message": AIMessageSerializer(user_message).data,
                    "assistant_message": AIMessageSerializer(error_message).data,
                    "error": str(e),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

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
        if pk != 'new':  # 特殊值 'new' 表示新會話
            try:
                session = AISession.objects.get(session_id=pk, user=request.user)
                logger.debug(f"Found existing session {pk} for user {request.user.id}")
            except AISession.DoesNotExist:
                # pk 不存在於資料庫，可能是新會話的 backend_session_id
                logger.debug(f"Session {pk} not found - will create new session for user {request.user.id}")
                session = None

        serializer = SendMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        content = serializer.validated_data["content"]
        skill = serializer.validated_data.get("skill")
        system_prompt = serializer.validated_data.get("system_prompt")
        reference = serializer.validated_data.get("reference")
        # 前端可能傳送已保存的 claude_session_id
        frontend_session_id = serializer.validated_data.get("session_id")

        # Check if this is the first message (for auto-naming)
        is_first_message = session is None or session.messages.count() == 0

        # Save user message (only if session exists)
        # For new sessions, we'll save the message after session is created in generate_stream()
        user_message_id = None
        if session:
            msg = AIMessage.objects.create(
                session=session,
                role=AIMessage.Role.USER,
                content=content,
                message_type=AIMessage.MessageType.TEXT,
            )
            user_message_id = msg.id

        # Auto-generate session title for first message (disabled during testing)
        # if is_first_message and not session.context.get("title"):
        #     import threading
        #     threading.Thread(
        #         target=update_session_title_async,
        #         args=(session, content, user_api_key),
        #         daemon=True,
        #     ).start()

        # Create execution log for streaming (only if session exists)
        log = None
        if session:
            log = create_execution_log(
                user=request.user,
                session=session,
                user_message=content,
            )

        def generate_stream():
            """Generate SSE stream by proxying to ai-service.

            新設計：
            1. 如果前端傳送了 session_id，優先使用前端傳送的 session_id
            2. 如果 session 存在（資料庫查詢到），使用 session.session_id
            3. 否則 session_id = None，ai-service 會初始化新會話

            元數據收集：
            - 收集所有 thinking、tool_start/result、usage 事件
            - 保存到 AIMessage.metadata 和 AIExecutionLog
            """
            nonlocal session  # 允許修改外部的 session 變量

            full_response = ""
            stream_error = None
            received_session_id = None

            # 元數據收集變量
            thinking_content = ""
            all_tools_executed = []
            collected_usage = None
            current_tool = None

            # 1. 決定使用哪個 session_id 與 ai-service 通信
            # 優先順序：前端傳送的 session_id > 現存會話的 session_id > None（新會話）
            ai_service_session_id = None
            if frontend_session_id:  # 前端傳送的 session_id（已保存的 claude_session_id）
                ai_service_session_id = frontend_session_id
                logger.debug(f"Using frontend session_id {ai_service_session_id[:8]}... for user {request.user.id}")
            elif session:  # 現存會話
                ai_service_session_id = session.session_id
                logger.debug(f"Resuming existing session {ai_service_session_id[:8]}... for user {request.user.id}")
            else:  # 新會話
                logger.debug(f"Creating new session for user {request.user.id}")

            # 2. 構建 ai-service 請求
            ai_service_payload = {
                "conversation": [{"role": "user", "content": content}],
                "session_id": ai_service_session_id,  # None 表示創建新會話，否則恢復
            }

            if system_prompt:
                ai_service_payload["system_prompt"] = system_prompt
            if skill:
                ai_service_payload["skill"] = skill

            try:
                # 3. 發送初始化事件（告知前端這個請求使用的 backend_session_id）
                init_event = {
                    "type": "init",
                    "backend_session_id": pk,  # 前端用於識別的 ID
                    "is_new_session": session is None,
                }
                yield f"data: {json.dumps(init_event)}\n\n"

                # 4. 代理請求到 ai-service
                with httpx.stream(
                    "POST",
                    "http://ai-service:8001/api/chat/stream",
                    json=ai_service_payload,
                    timeout=120.0
                ) as response:
                    if response.status_code != 200:
                        error_text = response.text
                        logger.error(f"ai-service error: {response.status_code} - {error_text}")
                        stream_error = f"ai-service error: {response.status_code}"
                        yield f"data: {json.dumps({'type': 'error', 'content': stream_error})}\n\n"
                        return

                    # 5. 轉發 SSE 流並完整收集元數據
                    for line in response.iter_lines():
                        # 轉發所有行（包括空行）
                        if line.strip():
                            if line.startswith("data: "):
                                try:
                                    event = json.loads(line[6:])
                                    event_type = event.get("type")

                                    # ===== 元數據收集開始 =====

                                    # 捕獲 session 事件（ai-service 返回的 session_id）
                                    if event_type == "session" and event.get("session_id"):
                                        received_session_id = event.get("session_id")
                                        logger.info(f"Received session_id from ai-service: {received_session_id}")

                                    # 累積內容
                                    if event_type == "delta" and event.get("content"):
                                        full_response += event.get("content", "")

                                    # 收集思考過程
                                    if event_type == "thinking" and event.get("thinking"):
                                        thinking_content = event.get("thinking", "")
                                        logger.debug(f"Captured thinking: {len(thinking_content)} chars")

                                    # 收集工具開始事件
                                    if event_type == "tool_start":
                                        current_tool = {
                                            "tool_name": event.get("tool_name"),
                                            "tool_use_id": event.get("tool_use_id"),
                                            "input": event.get("input"),
                                            "start_time_ms": event.get("start_time_ms"),
                                            "skill_metadata": event.get("skill_metadata"),
                                        }
                                        logger.debug(f"Tool start: {current_tool.get('tool_name')}")

                                    # 收集工具結果
                                    if event_type == "tool_result" and current_tool:
                                        current_tool["result"] = event.get("result")
                                        current_tool["is_error"] = event.get("is_error", False)
                                        current_tool["duration_ms"] = event.get("duration_ms")
                                        all_tools_executed.append(current_tool)
                                        logger.debug(
                                            f"Tool result: {current_tool.get('tool_name')} "
                                            f"({'error' if current_tool.get('is_error') else 'success'})"
                                        )
                                        current_tool = None

                                    # 收集 usage 信息
                                    if event_type == "usage":
                                        collected_usage = {
                                            "input_tokens": event.get("input_tokens"),
                                            "output_tokens": event.get("output_tokens"),
                                            "cost_cents": event.get("cost_cents"),
                                        }
                                        logger.debug(f"Usage: {collected_usage}")

                                    # ===== 元數據收集結束 =====

                                    # 轉發事件給前端
                                    yield f"{line}\n\n"
                                except json.JSONDecodeError:
                                    logger.debug(f"Failed to parse SSE line: {line}")
                                    # 即使解析失敗也轉發給前端
                                    yield f"{line}\n\n"
                            else:
                                # 非 data: 行也應該轉發
                                yield f"{line}\n"
                        else:
                            # 空行也應該轉發
                            yield "\n"

            except Exception as e:
                stream_error = str(e)
                logger.exception(f"Error proxying to ai-service: {e}")
                yield f"data: {json.dumps({'type': 'error', 'content': stream_error})}\n\n"

            finally:
                # 6. 保存/創建 AISession
                if received_session_id:
                    if not session:
                        # 新會話：使用 ai-service 返回的 session_id 作為 pk 創建 AISession
                        session = AISession.objects.create(
                            session_id=received_session_id,
                            user=request.user,
                            context={},
                        )
                        logger.info(f"Created new session {received_session_id[:8]}... for user {request.user.id}")

                        # 新會話時，需要創建用戶訊息
                        AIMessage.objects.create(
                            session=session,
                            role=AIMessage.Role.USER,
                            content=content,
                            message_type=AIMessage.MessageType.TEXT,
                        )

                        # 新會話時，需要創建執行日誌
                        nonlocal log
                        if not log:
                            log = create_execution_log(
                                user=request.user,
                                session=session,
                                user_message=content,
                            )
                    else:
                        # 現存會話：確保 session_id 一致（不應該改變）
                        if session.session_id != received_session_id:
                            logger.warning(
                                f"Session ID mismatch: expected {session.session_id}, "
                                f"got {received_session_id}"
                            )
                        session.updated_at = timezone.now()
                        session.save(update_fields=["updated_at"])

                # 7. 保存 AI 回應訊息（包含完整元數據）
                if session and full_response:
                    # 構建元數據
                    message_metadata = {}
                    if thinking_content:
                        message_metadata["thinking"] = thinking_content
                    if all_tools_executed:
                        message_metadata["tools_executed"] = all_tools_executed
                    if collected_usage:
                        message_metadata["usage"] = collected_usage

                    AIMessage.objects.create(
                        session=session,
                        role=AIMessage.Role.ASSISTANT,
                        content=full_response,
                        message_type=AIMessage.MessageType.TEXT,
                        metadata=message_metadata if message_metadata else None,
                    )

                # 8. 完成執行日誌（傳遞完整元數據）
                if log:
                    # 構建執行日誌的元數據
                    log_metadata = {
                        "error": stream_error,
                        "session_id": received_session_id,
                    }
                    if thinking_content:
                        log_metadata["thinking"] = thinking_content
                    if all_tools_executed:
                        log_metadata["tools_executed"] = all_tools_executed
                    if collected_usage:
                        log_metadata["usage"] = collected_usage

                    complete_execution_log(
                        log=log,
                        ai_response=full_response if full_response else None,
                        raw_log=log_metadata,
                        metadata=log_metadata,
                    )

                    # 保存 token 計數（確保有默認值）
                    log.input_tokens = collected_usage.get("input_tokens", 0) if collected_usage else 0
                    log.output_tokens = collected_usage.get("output_tokens", 0) if collected_usage else 0
                    log.cost_cents = collected_usage.get("cost_cents", 0) if collected_usage else 0
                    log.save()

        response = StreamingHttpResponse(
            generate_stream(), content_type="text/event-stream"
        )
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response

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
            "session_id": str(session.id),
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
        session = self.get_object()

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
            client = get_ai_client()

            # Run async call in sync context
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                result = loop.run_until_complete(
                    client.submit_user_answer(request_id, answers)
                )
            finally:
                loop.close()

            return Response(result)

        except Exception as e:
            logger.exception(f"Error submitting user answer: {e}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def _build_conversation_history(self, session):
        """Build conversation history for context."""
        messages = session.messages.order_by("created_at")[:20]  # Limit to last 20
        history = []
        for msg in messages:
            history.append({"role": msg.role, "content": msg.content})
        return history
