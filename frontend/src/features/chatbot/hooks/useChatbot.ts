import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import i18n from "i18next";
import type {
  BackgroundInformation,
  ChatMessage,
  ChatSession,
  UserInputRequest,
  ChatContext,
  ApprovalRequest,
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
  sendMessage: (content: string) => Promise<void>;
  stopStreaming: () => void;
  refreshSessions: () => Promise<void>;
  submitUserInput: (
    requestId: string,
    answers: Record<string, string>,
  ) => Promise<void>;
  cancelUserInput: () => void;
  submitApproval: (decision: "approve" | "reject") => Promise<void>;
  dismissApproval: () => void;
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
    onProblemUpdated: _onProblemUpdated,
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

  // Abort any in-flight stream when the component unmounts to prevent
  // state updates on an unmounted component and dangling fetch connections.
  useEffect(() => {
    return () => { abortControllerRef.current?.abort(); };
  }, []);

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
   * 載入所有 sessions（僅列表，不含 messages）
   */
  const refreshSessions = useCallback(async () => {
    try {
      setError(null);
      const apiSessions = await chatbotRepository.getSessions();
      setSessions(apiSessions);

      if (apiSessions.length > 0 && !currentSessionIdRef.current) {
        setCurrentSessionId(apiSessions[0].id);
      }
    } catch (err) {
      console.error("Failed to load sessions:", err);
      setError(i18n.t("chatbot:errors.loadSessionsFailed"));
    }
  }, [setCurrentSessionId]);

  /**
   * Lazy load：載入指定 session 的 messages（若尚未載入）
   */
  const loadSessionMessages = useCallback(async (sessionId: string) => {
    // 檢查是否已載入（temp session 或已有 messages 的 session 不需要再載入）
    const existing = sessions.find((s) => s.id === sessionId);
    if (!existing || existing.id.startsWith("temp-") || existing.messages.length > 0) return;

    try {
      const detailed = await chatbotRepository.getSession(sessionId);
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? detailed : s)),
      );
    } catch (err) {
      console.warn("Failed to load session messages:", err);
    }
  }, [sessions]);

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
        // 只載入列表（不含 messages），速度快
        const apiSessions = await chatbotRepository.getSessions();

        if (apiSessions.length === 0) {
          const newSession = await chatbotRepository.createSession();
          setSessions([newSession]);
          setCurrentSessionId(newSession.id);
        } else {
          // 選定 active session
          const savedSession = savedSessionId
            ? apiSessions.find((s) => s.id === savedSessionId)
            : null;
          const activeId = savedSession?.id ?? apiSessions[0].id;

          // 建立一個新的空 session 放最前面
          const newSession = await chatbotRepository.createSession();
          setSessions([newSession, ...apiSessions]);
          setCurrentSessionId(newSession.id);

          // 背景 lazy load active session 的 messages（如果選了舊 session）
          if (savedSession) {
            setCurrentSessionId(activeId);
            chatbotRepository.getSession(activeId).then((detailed) => {
              setSessions((prev) =>
                prev.map((s) => (s.id === activeId ? detailed : s)),
              );
            }).catch(() => { /* ignore, will load on click */ });
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
   * 切換 session（lazy load messages）
   */
  const switchSession = useCallback(async (sessionId: string) => {
    setCurrentSessionId(sessionId);

    // Lazy load messages if not yet loaded
    const existing = sessions.find((s) => s.id === sessionId);
    if (existing && !existing.id.startsWith("temp-") && existing.messages.length === 0) {
      try {
        const detailed = await chatbotRepository.getSession(sessionId);
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? detailed : s)),
        );
      } catch (err) {
        console.warn("Failed to load session messages:", err);
      }
    }
  }, [sessions]);

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
    async (content: string) => {
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

            // HITL 核准請求（AwaitingApproval）
            onAwaitingApproval: (request) => {
              setPendingApproval(request);
            },

          },
          {
            context: effectiveContext ?? undefined,
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
   * Resume interrupted agent stream after user input submission.
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

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

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
          { signal: abortController.signal },
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
   * 提交 HITL 核准決定（核准或拒絕）
   */
  const submitApproval = useCallback(
    async (decision: "approve" | "reject") => {
      if (!currentSessionId) return;
      setPendingApproval(null);
      await resumeAgent(decision);
    },
    [currentSessionId, resumeAgent],
  );

  /**
   * 關閉 HITL 核准彈窗（不提交任何決定）
   */
  const dismissApproval = useCallback(() => {
    setPendingApproval(null);
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
    submitApproval,
    dismissApproval,
    clearError,
  };
}

export default useChatbot;
