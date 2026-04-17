import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import i18n from "i18next";
import type {
  BackgroundInformation,
  ChatSession,
  ChatContext,
  ApprovalRequest,
  ChatRun,
  ChatMessage,
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
  pendingApproval: ApprovalRequest | null;
  createSession: () => Promise<string | null>;
  deleteSession: (sessionId: string) => Promise<void>;
  switchSession: (sessionId: string) => void;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  stopStreaming: () => void;
  refreshSessions: () => Promise<void>;
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

export interface StreamedRunState {
  content: string;
  thinking: string;
}

function appendSubscriptionDelta(previous: string, next: string | undefined) {
  if (typeof next !== "string") {
    return { nextStreamValue: previous, delta: undefined };
  }
  const delta = next.startsWith(previous) ? next.slice(previous.length) : next;
  return { nextStreamValue: next, delta };
}

function mergeStreamedText(existing: string, streamedValue: string, delta?: string) {
  if (!delta) return existing;
  if (!existing) return streamedValue;
  if (streamedValue.startsWith(existing)) return streamedValue;
  if (existing.startsWith(streamedValue)) return existing;
  return `${existing}${delta}`;
}

function createAssistantDraft(
  run: ChatRun,
  messageUpdate: Partial<ChatMessage>,
): ChatMessage {
  return {
    id: String(run.assistantMessageId ?? `run-${run.id}-assistant`),
    role: "assistant",
    content: "",
    timestamp: new Date(),
    runId: run.id,
    runStatus: run.status,
    isThinking: run.status === "queued" || run.status === "running",
    ...messageUpdate,
  };
}

export function applyRunMessageUpdate(
  session: ChatSession,
  run: ChatRun,
  messageUpdate: Partial<ChatMessage>,
  streamedState: StreamedRunState,
): ChatSession {
  const assistantMessageId = String(run.assistantMessageId ?? `run-${run.id}-assistant`);
  const contentDelta = appendSubscriptionDelta(streamedState.content, messageUpdate.content);
  streamedState.content = contentDelta.nextStreamValue;

  const nextThinking = messageUpdate.thinkingInfo?.thinking;
  const thinkingDelta = appendSubscriptionDelta(streamedState.thinking, nextThinking);
  streamedState.thinking = thinkingDelta.nextStreamValue;

  let didUpdateExistingDraft = false;
  const messages = session.messages.map((message) => {
    if (message.id !== assistantMessageId && message.runId !== run.id) return message;
    didUpdateExistingDraft = true;

    const mergedThinking = messageUpdate.thinkingInfo
      ? {
          ...messageUpdate.thinkingInfo,
          thinking: mergeStreamedText(
            message.thinkingInfo?.thinking ?? "",
            streamedState.thinking,
            thinkingDelta.delta,
          ),
        }
      : message.thinkingInfo;

    return {
      ...message,
      ...messageUpdate,
      content: mergeStreamedText(
        message.content,
        streamedState.content,
        contentDelta.delta,
      ),
      thinkingInfo: mergedThinking,
      runId: message.runId ?? run.id,
      runStatus: messageUpdate.runStatus ?? run.status,
      lastEventSeq: messageUpdate.lastEventSeq ?? message.lastEventSeq,
    };
  });

  if (!didUpdateExistingDraft) {
    messages.push(createAssistantDraft(run, messageUpdate));
  }

  return {
    ...session,
    messages,
  };
}

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
  const [pendingApproval, setPendingApproval] =
    useState<ApprovalRequest | null>(null);
  const [activeRuns, setActiveRuns] = useState<ChatRun[]>([]);

  // AbortController for cancelling only the local event subscription.
  const abortControllerRef = useRef<AbortController | null>(null);

  // Abort any in-flight event subscription when the component unmounts.
  // This does not cancel backend-controlled AI runs.
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

  const applyActiveRunsToSessions = useCallback(
    (sessionList: ChatSession[], runs: ChatRun[]): ChatSession[] =>
      sessionList.map((session) => {
        const activeRun = runs.find((run) => run.sessionId === session.id);
        if (!activeRun) return session;
        return {
          ...session,
          metadata: {
            ...session.metadata,
            active_run_id: activeRun.id,
            active_run_status: activeRun.status,
          },
        };
      }),
    [],
  );

  /**
   * 載入所有 sessions（僅列表，不含 messages）
   */
  const refreshSessions = useCallback(async () => {
    try {
      setError(null);
      const [apiSessions, runs] = await Promise.all([
        chatbotRepository.getSessions(),
        chatbotRepository.getActiveRuns(),
      ]);
      setActiveRuns(runs);
      setSessions(applyActiveRunsToSessions(apiSessions, runs));

      if (apiSessions.length > 0 && !currentSessionIdRef.current) {
        setCurrentSessionId(apiSessions[0].id);
      }
    } catch (err) {
      console.error("Failed to load sessions:", err);
      setError(i18n.t("chatbot:errors.loadSessionsFailed"));
    }
  }, [applyActiveRunsToSessions, setCurrentSessionId]);

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
        // 只載入列表（不含 messages），速度快；active runs 讓 reload 後知道哪些任務還在後端執行。
        const [apiSessions, runs] = await Promise.all([
          chatbotRepository.getSessions(),
          chatbotRepository.getActiveRuns(),
        ]);
        setActiveRuns(runs);
        const sessionsWithRuns = applyActiveRunsToSessions(apiSessions, runs);

        if (sessionsWithRuns.length === 0) {
          const newSession = await chatbotRepository.createSession();
          setSessions([newSession]);
          setCurrentSessionId(newSession.id);
        } else {
          // 恢復 saved session，或選第一個
          const savedSession = savedSessionId
            ? sessionsWithRuns.find((s) => s.id === savedSessionId)
            : null;
          const activeId = savedSession?.id ?? sessionsWithRuns[0].id;

          setSessions(sessionsWithRuns);
          setCurrentSessionId(activeId);

          // 背景 lazy load active session 的 messages
          chatbotRepository.getSession(activeId).then((detailed) => {
            setSessions((prev) =>
              prev.map((s) => (s.id === activeId ? detailed : s)),
            );
          }).catch(() => { /* ignore, will load on click */ });
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
  }, [applyActiveRunsToSessions, enabled, setCurrentSessionId]);

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
    setPendingApproval(null);

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

  useEffect(() => {
    if (!enabled || !currentSessionId) return;
    const activeRun = activeRuns.find(
      (run) =>
        run.sessionId === currentSessionId &&
        ["queued", "running", "awaiting_approval"].includes(run.status),
    );

    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    if (!activeRun) {
      setIsStreaming(false);
      setIsLoading(false);
      return;
    }

    setIsStreaming(true);
    setIsLoading(activeRun.status !== "awaiting_approval");
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const streamedState = {
      content: "",
      thinking: "",
    };

    chatbotRepository.subscribeRunEvents(
      activeRun,
      {
        onMessageUpdate: (messageUpdate) => {
          setSessions((prev) =>
            prev.map((session) =>
              session.id === activeRun.sessionId
                ? applyRunMessageUpdate(session, activeRun, messageUpdate, streamedState)
                : session,
            ),
          );
        },
        onComplete: (freshSession) => {
          setSessions((prev) =>
            prev.map((session) =>
              session.id === freshSession.id ? freshSession : session,
            ),
          );
          setActiveRuns((prev) => prev.filter((run) => run.id !== activeRun.id));
          setIsStreaming(false);
          setIsLoading(false);
        },
        onError: (errorMsg) => {
          setError(errorMsg);
          setActiveRuns((prev) => prev.filter((run) => run.id !== activeRun.id));
          setIsStreaming(false);
          setIsLoading(false);
        },
        onAwaitingApproval: (request) => {
          setPendingApproval(request);
          setActiveRuns((prev) =>
            prev.map((run) =>
              run.id === activeRun.id ? { ...run, status: "awaiting_approval" } : run,
            ),
          );
          setIsLoading(false);
        },
      },
      { signal: controller.signal },
    );

    return () => {
      controller.abort();
    };
  }, [activeRuns, currentSessionId, enabled]);

  /**
   * 發送訊息（建立後端控管的 durable run）
   */
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || !currentSessionId) return;

      const trimmedContent = content.trim();
      let sessionIdForRequest = currentSessionId;

      if (currentSessionId.startsWith("temp-")) {
        try {
          const newSessionData = await chatbotRepository.createBackendSession();
          sessionIdForRequest = newSessionData.id;
          setSessions((prev) =>
            prev.map((session) =>
              session.id === currentSessionId
                ? {
                    ...session,
                    id: newSessionData.id,
                    metadata: {
                      ...session.metadata,
                      backend_session_id: newSessionData.id,
                    },
                  }
                : session,
            ),
          );
          setCurrentSessionId(newSessionData.id);
        } catch (err) {
          console.error("Failed to create backend session:", err);
          setError(i18n.t("chatbot:errors.createBackendSessionFailed"));
          return;
        }
      }

      setIsStreaming(true);
      setIsLoading(true);
      setError(null);

      try {
        const run = await chatbotRepository.startRun(
          sessionIdForRequest,
          trimmedContent,
          { context: effectiveContext ?? undefined },
        );
        setActiveRuns((prev) => [...prev.filter((item) => item.id !== run.id), run]);

        const freshSession = await chatbotRepository.getSession(run.sessionId);
        setSessions((prev) => {
          const withoutTemp = prev.filter((session) => session.id !== currentSessionId);
          const existing = withoutTemp.some((session) => session.id === freshSession.id);
          return existing
            ? withoutTemp.map((session) =>
                session.id === freshSession.id ? freshSession : session,
              )
            : [freshSession, ...withoutTemp];
        });
        setCurrentSessionId(run.sessionId);
      } catch (err) {
        console.error("Failed to start AI run:", err);
        setError(i18n.t("chatbot:errors.sendMessageFailed"));
        setIsStreaming(false);
        setIsLoading(false);
      }
    },
    [currentSessionId, effectiveContext, setCurrentSessionId],
  );


  /**
   * Resume interrupted backend run after approval.
   */
  const resumeAgent = useCallback(
    async (decision: "approve" | "reject") => {
      const activeRun = activeRuns.find(
        (run) => run.sessionId === currentSessionId && run.status === "awaiting_approval",
      );
      if (!activeRun) return;

      setIsStreaming(true);
      setIsLoading(true);

      try {
        const run = await chatbotRepository.submitRunApproval(activeRun.id, decision);
        setActiveRuns((prev) =>
          prev.map((item) => (item.id === run.id ? run : item)),
        );
      } catch (err) {
        console.error("Resume run error:", err);
        setError(i18n.t("chatbot:errors.resumeAgentFailed"));
        setIsStreaming(false);
        setIsLoading(false);
      }
    },
    [activeRuns, currentSessionId],
  );

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
    const activeRun = activeRuns.find(
      (run) =>
        run.sessionId === currentSessionId &&
        ["queued", "running", "awaiting_approval"].includes(run.status),
    );
    if (!activeRun) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
      setIsLoading(false);
      return;
    }

    chatbotRepository.cancelRun(activeRun.id)
      .then((run) => {
        setActiveRuns((prev) =>
          prev.map((item) => (item.id === run.id ? run : item))
            .filter((item) => item.status !== "cancelled"),
        );
        return chatbotRepository.getSession(run.sessionId);
      })
      .then((freshSession) => {
        setSessions((prev) =>
          prev.map((session) =>
            session.id === freshSession.id ? freshSession : session,
          ),
        );
      })
      .catch((err) => {
        console.error("Failed to cancel run:", err);
        setError(i18n.t("chatbot:errors.stopRunFailed", "無法停止 AI 任務"));
      })
      .finally(() => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setIsStreaming(false);
        setIsLoading(false);
      });
  }, [activeRuns, currentSessionId]);

  return {
    sessions,
    currentSessionId,
    currentSession,
    isLoading,
    isStreaming,
    isInitializing,
    error,
    pendingApproval,
    createSession,
    deleteSession,
    switchSession,
    renameSession,
    sendMessage,
    stopStreaming,
    refreshSessions,
    submitApproval,
    dismissApproval,
    clearError,
  };
}

export default useChatbot;
