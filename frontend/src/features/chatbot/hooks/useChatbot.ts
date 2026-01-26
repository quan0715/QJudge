import { useState, useCallback, useEffect } from "react";
import type {
  BackgroundInformation,
  ChatMessage,
  ChatSession,
  UserInputRequest,
  ChatContext,
} from "@/core/types/chatbot.types";
import { chatbotRepository } from "@/infrastructure/api/repositories";
import { buildBackgroundInfoPrefix } from "../utils/backgroundInfo";

interface UseChatbotReturn {
  sessions: ChatSession[];
  currentSessionId: string | null;
  currentSession: ChatSession | null;
  isLoading: boolean;
  isStreaming: boolean;
  isInitializing: boolean;
  error: string | null;
  pendingUserInput: UserInputRequest | null;
  createSession: () => Promise<string | null>;
  deleteSession: (sessionId: string) => Promise<void>;
  switchSession: (sessionId: string) => void;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  clearCurrentSession: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  submitUserInput: (
    requestId: string,
    answers: Record<string, string>
  ) => Promise<void>;
  cancelUserInput: () => void;
  clearError: () => void;
}

interface UseChatbotOptions {
  /** 是否啟用（延遲初始化用） */
  enabled?: boolean;
  /** 背景資訊（在第一則訊息時附加） - DEPRECATED，改用 context */
  backgroundInfo?: BackgroundInformation | null;
  /** 背景上下文（統一的背景資訊結構） */
  context?: ChatContext | null;
}

/**
 * Chatbot 狀態管理 hook
 * 連接後端 API，支援多 session 管理
 */
export function useChatbot(options: UseChatbotOptions = {}): UseChatbotReturn {
  const { enabled = true, backgroundInfo = null, context = null } = options;
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingUserInput, setPendingUserInput] =
    useState<UserInputRequest | null>(null);

  const currentSession =
    sessions.find((session) => session.id === currentSessionId) ?? null;

  /**
   * 載入所有 sessions
   */
  const refreshSessions = useCallback(async () => {
    try {
      setError(null);
      const apiSessions = await chatbotRepository.getSessions();

      // 取得每個 session 的詳細資料（含 messages）
      const detailedSessions = await Promise.all(
        apiSessions.map((session) => chatbotRepository.getSession(session.id))
      );

      setSessions(detailedSessions);

      // 如果沒有當前選中的 session，選擇第一個
      if (detailedSessions.length > 0 && !currentSessionId) {
        setCurrentSessionId(detailedSessions[0].id);
      }
    } catch (err) {
      console.error("Failed to load sessions:", err);
      setError("無法載入對話記錄");
    }
  }, [currentSessionId]);

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

      // 清除舊的 localStorage 資料（遷移後不再使用）
      try {
        localStorage.removeItem("ai_sessions");
      } catch (e) {
        // Ignore localStorage errors
      }

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
              chatbotRepository.getSession(session.id)
            )
          );

          // 檢查最新的 session 是否為空
          const latestSession = detailedSessions[0];
          const isLatestEmpty = latestSession.messages.length === 0;

          if (isLatestEmpty) {
            // 重用空白 session
            setSessions(detailedSessions);
            setCurrentSessionId(latestSession.id);
          } else {
            // 最新 session 有內容，創建新的
            const newSession = await chatbotRepository.createSession();
            setSessions([newSession, ...detailedSessions]);
            setCurrentSessionId(newSession.id);
          }
        }
      } catch (err) {
        console.error("Failed to initialize chatbot:", err);
        const errorMessage = err instanceof Error ? err.message : "未知錯誤";

        // 檢查是否是認證錯誤
        if (
          errorMessage.includes("登入") ||
          errorMessage.includes("401")
        ) {
          setError("請先登入以使用 AI 助教功能");
        } else {
          setError(`初始化失敗：${errorMessage}`);
        }

        // 認證錯誤或其他錯誤都不建立 fallback session
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
      setError("無法創建新對話");
      return null;
    }
  }, []);

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
        setError("無法刪除對話");
      }
    },
    [currentSessionId, createSession]
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
  const renameSession = useCallback(async (sessionId: string, title: string) => {
    try {
      setError(null);
      await chatbotRepository.renameSession(sessionId, title);

      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId
            ? { ...session, title, updatedAt: new Date() }
            : session
        )
      );
    } catch (err) {
      console.error("Failed to rename session:", err);
      setError("無法重新命名對話");
    }
  }, []);

  /**
   * 發送訊息（使用串流）
   */
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || !currentSessionId) return;

      let trimmedContent = content.trim();

      // 檢查是否為第一則訊息（session 中沒有訊息）
      const isFirstMessage = currentSession?.messages.length === 0;

      // 如果是第一條訊息且沒有後端 session ID，先建立
      let sessionIdForRequest = currentSessionId;
      const backendSessionId = currentSession?.metadata?.backend_session_id;

      if (isFirstMessage && !backendSessionId) {
        try {
          const newSessionResponse = await fetch(`/api/v1/ai/sessions/new_session/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });

          if (!newSessionResponse.ok) {
            throw new Error("Failed to create backend session");
          }

          const newSessionData = await newSessionResponse.json();
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
                : session
            )
          );
        } catch (err) {
          console.error("Failed to create backend session:", err);
          setError("無法建立對話，請稍後再試");
          return;
        }
      }

      // 如果是第一則訊息且有背景資訊，加上背景資訊前綴
      if (isFirstMessage && backgroundInfo) {
        const bgPrefix = buildBackgroundInfoPrefix(backgroundInfo);
        trimmedContent = bgPrefix + "\n" + trimmedContent;
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
            : session
        )
      );

      setIsStreaming(true);
      setIsLoading(true);
      setError(null);

      try {
        await chatbotRepository.sendMessageStream(
          sessionIdForRequest,
          trimmedContent,
          // onDelta - 逐步更新 AI 訊息
          (delta) => {
            setSessions((prev) =>
              prev.map((session) =>
                session.id === currentSessionId
                  ? {
                      ...session,
                      messages: session.messages.map((message) =>
                        message.id === tempAssistantId
                          ? {
                              ...message,
                              content: message.content + delta,
                              isThinking: false,
                            }
                          : message
                      ),
                    }
                  : session
              )
            );
          },
          // onToolStart - 工具調用開始
          (toolName) => {
            setSessions((prev) =>
              prev.map((session) =>
                session.id === currentSessionId
                  ? {
                      ...session,
                      messages: session.messages.map((message) =>
                        message.id === tempAssistantId
                          ? { ...message, toolName, isThinking: false }
                          : message
                      ),
                    }
                  : session
              )
            );
          },
          // onDone - 從後端重新載入完整 session
          () => {
            chatbotRepository
              .getSession(currentSessionId)
              .then((freshSession) => {
                setSessions((prev) =>
                  prev.map((session) =>
                    session.id === currentSessionId ? freshSession : session
                  )
                );
              })
              .catch((err) => {
                console.warn("Failed to refresh session from backend:", err);
                // 無法重新整理時，至少清除暫時訊息的思考狀態
                setSessions((prev) =>
                  prev.map((session) =>
                    session.id === currentSessionId
                      ? {
                          ...session,
                          messages: session.messages.map((message) =>
                            message.id === tempAssistantId
                              ? {
                                  ...message,
                                  isThinking: false,
                                  toolName: undefined,
                                }
                              : message
                          ),
                        }
                      : session
                  )
                );
              });
            setIsStreaming(false);
            setIsLoading(false);
          },
          // onError
          (errorMsg) => {
            setError(errorMsg);
            setIsStreaming(false);
            setIsLoading(false);
          },
          { context: context ?? undefined, skill: undefined },
          // onUserInputRequest - AI 需要用戶回答問題
          (request) => {
            setPendingUserInput(request);
          },
          // onThinking - AI 思考過程
          (thinkingInfo) => {
            setSessions((prev) =>
              prev.map((session) =>
                session.id === currentSessionId
                  ? {
                      ...session,
                      messages: session.messages.map((message) =>
                        message.id === tempAssistantId
                          ? { ...message, thinkingInfo, isThinking: true }
                          : message
                      ),
                    }
                  : session
              )
            );
          },
          // onToolResult - 工具執行結果
          (toolInfo) => {
            setSessions((prev) =>
              prev.map((session) =>
                session.id === currentSessionId
                  ? {
                      ...session,
                      messages: session.messages.map((message) =>
                        message.id === tempAssistantId
                          ? {
                              ...message,
                              toolExecutions: [
                                ...(message.toolExecutions || []),
                                toolInfo,
                              ],
                              toolName: undefined,
                            }
                          : message
                      ),
                    }
                  : session
              )
            );
          }
        );
      } catch (err) {
        console.error("Stream error:", err);
        setError("無法發送訊息");

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
                          content:
                            "抱歉，AI 服務暫時無法使用，請稍後再試。",
                        }
                      : message
                  ),
                }
              : session
          )
        );

        setIsStreaming(false);
        setIsLoading(false);
      }
    },
    [currentSessionId, currentSession, backgroundInfo]
  );

  /**
   * 清除當前 session 的訊息
   */
  const clearCurrentSession = useCallback(async () => {
    if (!currentSessionId) return;

    try {
      setError(null);
      const clearedSession = await chatbotRepository.clearSession(
        currentSessionId
      );

      setSessions((prev) =>
        prev.map((session) =>
          session.id === currentSessionId ? clearedSession : session
        )
      );
    } catch (err) {
      console.error("Failed to clear session:", err);
      setError("無法清除對話");
    }
  }, [currentSessionId]);

  /**
   * 提交用戶回答（回應 AskUserQuestion）
   */
  const submitUserInput = useCallback(
    async (requestId: string, answers: Record<string, string>) => {
      if (!currentSessionId) return;

      try {
        await chatbotRepository.submitAnswer(currentSessionId, requestId, answers);
        setPendingUserInput(null);
      } catch (err) {
        console.error("Failed to submit user input:", err);
        setError("無法提交回答");
      }
    },
    [currentSessionId]
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

  return {
    sessions,
    currentSessionId,
    currentSession,
    isLoading,
    isStreaming,
    isInitializing,
    error,
    pendingUserInput,
    createSession,
    deleteSession,
    switchSession,
    renameSession,
    sendMessage,
    clearCurrentSession,
    refreshSessions,
    submitUserInput,
    cancelUserInput,
    clearError,
  };
}

export default useChatbot;
