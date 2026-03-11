import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import i18n from "i18next";
import type {
  ApprovalRequest,
  BackgroundInformation,
  ChatMessage,
  ChatModel,
  ChatSession,
  UserInputRequest,
  ChatContext,
} from "@/core/types/chatbot.types";
import { chatbotRepository } from "@/infrastructure/api/repositories";

interface UseChatbotReturn {
  sessions: ChatSession[];
  currentSessionId: string | null;
  currentSession: ChatSession | null;
  isLoading: boolean;
  isStreaming: boolean;
  isInitializing: boolean;
  error: string | null;
  pendingUserInput: UserInputRequest | null;
  pendingApproval: ApprovalRequest | null;
  createSession: () => Promise<string | null>;
  deleteSession: (sessionId: string) => Promise<void>;
  switchSession: (sessionId: string) => void;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  sendMessage: (content: string, modelId?: ChatModel) => Promise<void>;
  stopStreaming: () => void;
  refreshSessions: () => Promise<void>;
  submitUserInput: (
    requestId: string,
    answers: Record<string, string>,
  ) => Promise<void>;
  cancelUserInput: () => void;
  confirmAction: () => Promise<void>;
  cancelAction: () => Promise<void>;
  clearError: () => void;
}

interface UseChatbotOptions {
  /** 是否啟用（延遲初始化用） */
  enabled?: boolean;
  /** 舊版背景資訊，會轉換為 ChatContext.custom */
  backgroundInfo?: BackgroundInformation | null;
  /** 背景上下文（統一的背景資訊結構） */
  context?: ChatContext | null;
  /** Agent commit 成功後觸發（通知父頁面重新載入資料） */
  onProblemUpdated?: () => void;
}

/**
 * Chatbot 狀態管理 hook
 * 連接後端 API，支援多 session 管理
 */
const LAST_SESSION_KEY = "chatbot_last_session_id";

export function useChatbot(options: UseChatbotOptions = {}): UseChatbotReturn {
  const {
    enabled = true,
    backgroundInfo = null,
    context = null,
    onProblemUpdated,
  } = options;
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, _setCurrentSessionId] = useState<string | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);

  // 包裝 setCurrentSessionId，同步寫入 localStorage
  const setCurrentSessionId = useCallback((id: string | null) => {
    _setCurrentSessionId(id);
    currentSessionIdRef.current = id;
    if (id) {
      try { localStorage.setItem(LAST_SESSION_KEY, id); } catch { /* ignore */ }
    }
  }, []);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingUserInput, setPendingUserInput] =
    useState<UserInputRequest | null>(null);
  const [pendingApproval, setPendingApproval] =
    useState<ApprovalRequest | null>(null);

  // AbortController for cancelling streaming
  const abortControllerRef = useRef<AbortController | null>(null);

  const currentSession =
    sessions.find((session) => session.id === currentSessionId) ?? null;

  const effectiveContext = useMemo<ChatContext | null>(() => {
    if (context) return context;
    if (!backgroundInfo) return null;

    return {
      custom: {
        backgroundInfo,
      },
    };
  }, [backgroundInfo, context]);

  /**
   * 載入所有 sessions
   */
  const refreshSessions = useCallback(async () => {
    try {
      setError(null);
      const apiSessions = await chatbotRepository.getSessions();

      // 取得每個 session 的詳細資料（含 messages）
      const detailedSessions = await Promise.all(
        apiSessions.map((session) => chatbotRepository.getSession(session.id)),
      );

      setSessions(detailedSessions);

      // 如果沒有當前選中的 session，選擇第一個
      if (detailedSessions.length > 0 && !currentSessionIdRef.current) {
        setCurrentSessionId(detailedSessions[0].id);
      }
    } catch (err) {
      console.error("Failed to load sessions:", err);
      setError(i18n.t("chatbot:errors.loadSessionsFailed"));
    }
  }, [setCurrentSessionId]);

  /**
   * 初始化：從後端 API 載入 sessions
   * 只有當 enabled 為 true 時才執行
   *
   * UX 優化：
   * - 如果最新的 session 是空的（沒有訊息），重用它
   * - 否則創建一個新的 session，確保每次打開都能開始新對話
   */
  useEffect(() => {
    if (!enabled) {
      setIsInitializing(false);
      return;
    }

    const init = async () => {
      setIsInitializing(true);
      setError(null);

      // 嘗試從 localStorage 恢復上次的 session
      let savedSessionId: string | null = null;
      try { savedSessionId = localStorage.getItem(LAST_SESSION_KEY); } catch { /* ignore */ }

      try {
        const apiSessions = await chatbotRepository.getSessions();

        if (apiSessions.length === 0) {
          // 沒有 session，創建一個新的
          const newSession = await chatbotRepository.createSession();
          setSessions([newSession]);
          setCurrentSessionId(newSession.id);
        } else {
          // 載入詳細資料
          const detailedSessions = await Promise.all(
            apiSessions.map((session) =>
              chatbotRepository.getSession(session.id),
            ),
          );

          // 如果 localStorage 有記住的 session 且仍存在，直接恢復
          const savedSession = savedSessionId
            ? detailedSessions.find((s) => s.id === savedSessionId)
            : null;

          if (savedSession) {
            setSessions(detailedSessions);
            setCurrentSessionId(savedSession.id);
          } else {
            // 沒有記住的 session，走原本的邏輯
            const latestSession = detailedSessions[0];
            const isLatestEmpty = latestSession.messages.length === 0;

            if (isLatestEmpty) {
              setSessions(detailedSessions);
              setCurrentSessionId(latestSession.id);
            } else {
              const newSession = await chatbotRepository.createSession();
              setSessions([newSession, ...detailedSessions]);
              setCurrentSessionId(newSession.id);
            }
          }
        }
      } catch (err) {
        console.error("Failed to initialize chatbot:", err);
        const errorMessage = err instanceof Error ? err.message : i18n.t("chatbot:errors.unknownError");
        setError(errorMessage);
        setIsInitializing(false);
        return;
      }

      setIsInitializing(false);
    };

    init();
  }, [enabled]);

  /**
   * 創建新 session
   */
  const createSession = useCallback(async (): Promise<string | null> => {
    try {
      setError(null);
      const newSession = await chatbotRepository.createSession();

      setSessions((prev) => [...prev, newSession]);
      setCurrentSessionId(newSession.id);
      return newSession.id;
    } catch (err) {
      console.error("Failed to create session:", err);
      setError(i18n.t("chatbot:errors.createSessionFailed"));
      return null;
    }
  }, [setCurrentSessionId]);

  /**
   * 刪除 session
   */
  const deleteSession = useCallback(
    async (sessionId: string) => {
      try {
        setError(null);
        await chatbotRepository.deleteSession(sessionId);

        setSessions((prev) => {
          const filtered = prev.filter((session) => session.id !== sessionId);

          // 如果刪除的是當前 session，切換到第一個
          if (sessionId === currentSessionId && filtered.length > 0) {
            setCurrentSessionId(filtered[0].id);
          } else if (filtered.length === 0) {
            // 如果刪除後沒有 session，創建一個新的
            createSession();
          }

          return filtered;
        });
      } catch (err) {
        console.error("Failed to delete session:", err);
        setError(i18n.t("chatbot:errors.deleteSessionFailed"));
      }
    },
    [currentSessionId, createSession],
  );

  /**
   * 切換 session
   */
  const switchSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
  }, []);

  /**
   * 重新命名 session
   */
  const renameSession = useCallback(
    async (sessionId: string, title: string) => {
      try {
        setError(null);
        await chatbotRepository.renameSession(sessionId, title);

        setSessions((prev) =>
          prev.map((session) =>
            session.id === sessionId
              ? { ...session, title, updatedAt: new Date() }
              : session,
          ),
        );
      } catch (err) {
        console.error("Failed to rename session:", err);
        setError(i18n.t("chatbot:errors.renameSessionFailed"));
      }
    },
    [],
  );

  /**
   * 發送訊息（使用串流）
   */
  const sendMessage = useCallback(
    async (content: string, modelId?: ChatModel) => {
      if (!content.trim() || !currentSessionId) return;

      const trimmedContent = content.trim();

      // 檢查是否為第一則訊息（session 中沒有訊息）
      const isFirstMessage = currentSession?.messages.length === 0;

      // 如果是第一條訊息且沒有後端 session ID，先建立
      let sessionIdForRequest = currentSessionId;
      const backendSessionId = currentSession?.metadata?.backend_session_id;

      if (isFirstMessage && !backendSessionId) {
        try {
          const newSessionData = await chatbotRepository.createBackendSession();
          sessionIdForRequest = newSessionData.id;

          // 更新 session 的後端 ID
          // 注意：保持前端 session.id 不變，只在 metadata 中記錄後端 ID
          setSessions((prev) =>
            prev.map((session) =>
              session.id === currentSessionId
                ? {
                    ...session,
                    metadata: {
                      ...session.metadata,
                      backend_session_id: newSessionData.id,
                    },
                  }
                : session,
            ),
          );
        } catch (err) {
          console.error("Failed to create backend session:", err);
          setError(i18n.t("chatbot:errors.createBackendSessionFailed"));
          return;
        }
      }

      // 1. 新增臨時用戶訊息
      const tempUserMessage: ChatMessage = {
        id: `temp-user-${Date.now()}`,
        role: "user",
        content: trimmedContent,
        timestamp: new Date(),
      };

      // 2. 新增臨時 AI 訊息（用於串流更新）
      const tempAssistantId = `temp-assistant-${Date.now()}`;
      const tempAssistantMessage: ChatMessage = {
        id: tempAssistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isThinking: true, // 初始狀態為思考中
      };

      // 添加到 UI
      setSessions((prev) =>
        prev.map((session) =>
          session.id === currentSessionId
            ? {
                ...session,
                messages: [
                  ...session.messages,
                  tempUserMessage,
                  tempAssistantMessage,
                ],
                updatedAt: new Date(),
              }
            : session,
        ),
      );

      setIsStreaming(true);
      setIsLoading(true);
      setError(null);

      // Create AbortController for this stream
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        await chatbotRepository.sendMessageStream(
          sessionIdForRequest,
          trimmedContent,
          {
            // 高級回調：訊息增量更新（包含所有內容）
            onMessageUpdate: (messageUpdate) => {
              setSessions((prev) =>
                prev.map((session) =>
                  session.id === currentSessionId
                    ? {
                        ...session,
                        messages: session.messages.map((message) =>
                          message.id === tempAssistantId
                            ? { ...message, ...messageUpdate }
                            : message,
                        ),
                      }
                    : session,
                ),
              );
            },

            // 完成時更新為完整 session
            onComplete: (freshSession) => {
              setSessions((prev) =>
                prev.map((session) =>
                  session.id === currentSessionId ? freshSession : session,
                ),
              );
              if (freshSession.id !== currentSessionId) {
                setCurrentSessionId(freshSession.id);
              }
              setIsStreaming(false);
              setIsLoading(false);
            },

            // 錯誤處理
            onError: (errorMsg) => {
              setError(errorMsg);
              setIsStreaming(false);
              setIsLoading(false);

              // 更新臨時 AI 訊息為錯誤訊息
              setSessions((prev) =>
                prev.map((session) =>
                  session.id === currentSessionId
                    ? {
                        ...session,
                        messages: session.messages.map((message) =>
                          message.id === tempAssistantId
                            ? {
                                ...message,
                                content: i18n.t("chatbot:errors.aiServiceUnavailable"),
                                isThinking: false,
                              }
                            : message,
                        ),
                      }
                    : session,
                ),
              );
            },

            // 用戶輸入請求（AskUserQuestion）
            onUserInputRequest: (request) => {
              setPendingUserInput(request);
            },

            // v2: Approval required (preview-then-confirm)
            onApprovalRequired: (request) => {
              setPendingApproval(request);
              setIsStreaming(false);
              setIsLoading(false);
            },
          },
          {
            model: modelId,
            context: effectiveContext ?? undefined,
            skill: undefined,
            signal: abortController.signal,
          },
        );
      } catch (err) {
        // Ignore abort errors
        if (err instanceof DOMException && err.name === "AbortError") {
          setIsStreaming(false);
          setIsLoading(false);
          return;
        }
        console.error("Stream error:", err);
        setError(i18n.t("chatbot:errors.sendMessageFailed"));

        // 更新臨時 AI 訊息為錯誤訊息
        setSessions((prev) =>
          prev.map((session) =>
            session.id === currentSessionId
              ? {
                  ...session,
                  messages: session.messages.map((message) =>
                    message.id === tempAssistantId
                      ? {
                          ...message,
                          content: i18n.t("chatbot:errors.aiServiceUnavailable"),
                          isThinking: false,
                        }
                      : message,
                  ),
                }
              : session,
          ),
        );

        setIsStreaming(false);
        setIsLoading(false);
      }
    },
    [currentSessionId, currentSession, effectiveContext],
  );


  /**
   * Resume interrupted agent stream after approval/rejection.
   * Shared logic for confirmAction and cancelAction.
   */
  const resumeAgent = useCallback(
    async (decision: "approve" | "reject") => {
      if (!currentSessionId) return;

      // Add a temporary assistant message for the resume response
      const tempAssistantId = `temp-resume-${Date.now()}`;
      const tempAssistantMessage: ChatMessage = {
        id: tempAssistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isThinking: true,
      };

      setSessions((prev) =>
        prev.map((session) =>
          session.id === currentSessionId
            ? {
                ...session,
                messages: [...session.messages, tempAssistantMessage],
                updatedAt: new Date(),
              }
            : session,
        ),
      );

      setIsStreaming(true);
      setIsLoading(true);

      try {
        await chatbotRepository.resumeAgentStream(
          currentSessionId,
          decision,
          {
            onMessageUpdate: (messageUpdate) => {
              setSessions((prev) =>
                prev.map((session) =>
                  session.id === currentSessionId
                    ? {
                        ...session,
                        messages: session.messages.map((message) =>
                          message.id === tempAssistantId
                            ? { ...message, ...messageUpdate }
                            : message,
                        ),
                      }
                    : session,
                ),
              );
            },

            onComplete: (freshSession) => {
              setSessions((prev) =>
                prev.map((session) =>
                  session.id === currentSessionId ? freshSession : session,
                ),
              );
              setIsStreaming(false);
              setIsLoading(false);
            },

            onError: (errorMsg) => {
              setError(errorMsg);
              setIsStreaming(false);
              setIsLoading(false);
            },
          },
        );
      } catch (err) {
        console.error("Resume stream error:", err);
        setError(i18n.t("chatbot:errors.resumeAgentFailed"));
        setIsStreaming(false);
        setIsLoading(false);
      }
    },
    [currentSessionId],
  );

  /**
   * 確認 pending action（human-in-the-loop 流程）
   * 1. Confirm action on backend
   * 2. Resume agent stream with "approve" decision
   */
  const confirmAction = useCallback(async () => {
    if (!currentSessionId || !pendingApproval) return;

    const { actionId } = pendingApproval;
    setPendingApproval(null); // 立刻隱藏 banner
    setError(null);

    try {
      await chatbotRepository.confirmAction(currentSessionId, actionId);
      await resumeAgent("approve");
      // Commit 成功，通知父頁面重新載入資料
      onProblemUpdated?.();
    } catch (err) {
      console.error("Failed to confirm action:", err);
      setError(i18n.t("chatbot:errors.confirmActionFailed"));
    }
  }, [currentSessionId, pendingApproval, resumeAgent, onProblemUpdated]);

  /**
   * 取消 pending action
   * 1. Cancel action on backend
   * 2. Resume agent stream with "reject" decision
   */
  const cancelAction = useCallback(async () => {
    if (!currentSessionId || !pendingApproval) return;

    const { actionId } = pendingApproval;
    setPendingApproval(null); // 立刻隱藏 banner
    setError(null);

    try {
      await chatbotRepository.cancelAction(currentSessionId, actionId);
      await resumeAgent("reject");
    } catch (err) {
      console.error("Failed to cancel action:", err);
      setError(i18n.t("chatbot:errors.cancelActionFailed"));
    }
  }, [currentSessionId, pendingApproval, resumeAgent]);

  /**
   * 提交用戶回答（回應 AskUserQuestion）
   */
  const submitUserInput = useCallback(
    async (requestId: string, answers: Record<string, string>) => {
      if (!currentSessionId) return;

      setPendingUserInput(null); // 立刻關閉彈窗
      setError(null);

      try {
        await chatbotRepository.submitAnswer(
          currentSessionId,
          requestId,
          answers,
        );
      } catch (err) {
        console.error("Failed to submit answer:", err);
        setError(i18n.t("chatbot:errors.submitAnswerFailed"));
        return;
      }

      try {
        // 提交成功後，使用 resumeAgent 恢復串流獲取 AI 回應
        await resumeAgent("approve");
      } catch (err) {
        console.error("Failed to resume agent after answer submission:", err);
        setError(i18n.t("chatbot:errors.resumeAfterAnswerFailed"));
      }
    },
    [currentSessionId, resumeAgent],
  );

  /**
   * 取消用戶輸入（跳過問題）
   */
  const cancelUserInput = useCallback(() => {
    // Just close the modal without submitting
    // The AI service will timeout and continue without the input
    setPendingUserInput(null);
  }, []);

  /**
   * 清除錯誤訊息
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setIsLoading(false);
  }, []);

  return {
    sessions,
    currentSessionId,
    currentSession,
    isLoading,
    isStreaming,
    isInitializing,
    error,
    pendingUserInput,
    pendingApproval,
    createSession,
    deleteSession,
    switchSession,
    renameSession,
    sendMessage,
    stopStreaming,
    refreshSessions,
    submitUserInput,
    cancelUserInput,
    confirmAction,
    cancelAction,
    clearError,
  };
}

export default useChatbot;
