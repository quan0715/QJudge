import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import i18n from "i18next";
import type {
  BackgroundInformation,
  ChatSession,
  ChatContext,
  ModelInfo,
  ApprovalRequest,
  ChatRun,
  ChatMessage,
  ToolInfo,
  VerificationReport,
} from "@/core/types/chatbot.types";
import { chatbotRepository } from "@/infrastructure/api/repositories";
import { useChatSessionContext } from "../contexts/ChatSessionContext";

interface UseChatbotReturn {
  sessions: ChatSession[];
  currentSessionId: string | null;
  currentSession: ChatSession | null;
  isLoading: boolean;
  isStreaming: boolean;
  isInitializing: boolean;
  isSessionLoading: boolean;
  error: string | null;
  pendingApproval: ApprovalRequest | null;
  sessionNotice: string | null;
  availableModels: ModelInfo[];
  selectedModelId: string;
  setSelectedModelId: (modelId: string) => void;
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
  /** 從 URL 傳入的 session ID，useChatbot 會在初始化後切換到此 session */
  externalSessionId?: string;
  /** 當 session 被建立/切換時的回調（用於 URL navigation） */
  onSessionChange?: (newId: string) => void;
  /** 當 session 被刪除時的回調（用於 URL navigation） */
  onSessionDeleted?: (fallbackId: string | null) => void;
}

/**
 * Chatbot 狀態管理 hook
 * 連接後端 API，支援多 session 管理
 */
const LAST_SESSION_KEY = "chatbot_last_session_id";
const LAST_MODEL_KEY = "chatbot_last_model_id";
const DEFAULT_MODEL_ID = "openai-nano";
const FALLBACK_MODELS: ModelInfo[] = [
  {
    model_id: "openai-nano",
    display_name: "gpt-5-nano",
    description: "快速且成本低，適合日常教學互動",
    is_default: true,
  },
  {
    model_id: "deepseek-r1",
    display_name: "DeepSeek R1 (Thinking)",
    description: "推理能力強，適合複雜操作與測資生成",
    is_default: false,
  },
  {
    model_id: "deepseek-v3",
    display_name: "DeepSeek V3",
    description: "快速，適合簡單查詢",
    is_default: false,
  },
];

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

/**
 * Merge tool executions by `toolCallId`, keeping prior entries in order and
 * letting incoming entries update/append. Each new SSE subscription rebuilds
 * `currentMessage.toolExecutions` from an empty array (e.g., after a HITL
 * approve reopens a fresh stream), so a blind `...messageUpdate` spread would
 * wipe the history. This merge preserves all completed tool calls.
 */
function mergeToolExecutions(
  previous: ToolInfo[] | undefined,
  incoming: ToolInfo[] | undefined,
): ToolInfo[] | undefined {
  if (!incoming?.length) return previous;
  if (!previous?.length) return incoming;
  const incomingById = new Map<string, ToolInfo>();
  for (const exec of incoming) {
    if (exec.toolCallId) incomingById.set(exec.toolCallId, exec);
  }
  const merged: ToolInfo[] = [];
  const usedIds = new Set<string>();
  for (const exec of previous) {
    const id = exec.toolCallId;
    const replacement = id ? incomingById.get(id) : undefined;
    if (replacement && id) {
      merged.push(replacement);
      usedIds.add(id);
    } else {
      merged.push(exec);
    }
  }
  for (const exec of incoming) {
    if (exec.toolCallId && usedIds.has(exec.toolCallId)) continue;
    merged.push(exec);
  }
  return merged;
}

function mergeVerificationReports(
  previous: VerificationReport[] | undefined,
  incoming: VerificationReport[] | undefined,
): VerificationReport[] | undefined {
  if (!incoming?.length) return previous;
  if (!previous?.length) return incoming;
  const incomingByIter = new Map(incoming.map((r) => [r.iteration, r]));
  const merged: VerificationReport[] = [];
  const usedIters = new Set<number>();
  for (const report of previous) {
    const replacement = incomingByIter.get(report.iteration);
    if (replacement) {
      merged.push(replacement);
      usedIters.add(report.iteration);
    } else {
      merged.push(report);
    }
  }
  for (const report of incoming) {
    if (usedIters.has(report.iteration)) continue;
    merged.push(report);
  }
  return merged;
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
    if (message.role !== "assistant") return message;
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
      toolExecutions: mergeToolExecutions(
        message.toolExecutions,
        messageUpdate.toolExecutions,
      ),
      verificationReports: mergeVerificationReports(
        message.verificationReports,
        messageUpdate.verificationReports,
      ),
      runId: message.runId ?? run.id,
      runStatus: messageUpdate.runStatus ?? run.status,
      lastEventSeq: messageUpdate.lastEventSeq ?? message.lastEventSeq,
      todoItems: messageUpdate.todoItems ?? message.todoItems,
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
    externalSessionId,
    onSessionChange,
    onSessionDeleted,
  } = options;

  // Notify shared ChatSessionContext to refresh when session list changes
  const { refreshSessions: refreshSharedSessions } = useChatSessionContext();
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
  const [loadingSessionIds, setLoadingSessionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [error, setError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] =
    useState<ApprovalRequest | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>(FALLBACK_MODELS);
  const [selectedModelIdState, setSelectedModelIdState] = useState<string>(() => {
    try {
      return localStorage.getItem(LAST_MODEL_KEY) || DEFAULT_MODEL_ID;
    } catch {
      return DEFAULT_MODEL_ID;
    }
  });
  const [activeRuns, setActiveRuns] = useState<ChatRun[]>([]);
  // Incremented whenever we need to force the SSE subscription effect to
  // restart with the same activeRun (e.g., after POSTing an approval decision
  // that resumes the same run). activeRun.id/kind alone won't cover multi-turn
  // HITL because kind stays "resume" across successive approvals.
  const [subscribeEpoch, setSubscribeEpoch] = useState(0);

  // AbortController for cancelling only the local event subscription.
  const abortControllerRef = useRef<AbortController | null>(null);
  const resubscribeTimerRef = useRef<number | null>(null);

  // Abort any in-flight event subscription when the component unmounts.
  // This does not cancel backend-controlled AI runs.
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (resubscribeTimerRef.current !== null) {
        window.clearTimeout(resubscribeTimerRef.current);
        resubscribeTimerRef.current = null;
      }
    };
  }, []);

  const setSelectedModelId = useCallback((modelId: string) => {
    setSelectedModelIdState(modelId);
    try {
      localStorage.setItem(LAST_MODEL_KEY, modelId);
    } catch {
      // ignore localStorage failures
    }
  }, []);

  const currentSession =
    sessions.find((session) => session.id === currentSessionId) ?? null;
  const isSessionLoading =
    currentSessionId !== null && loadingSessionIds.has(currentSessionId);

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
        const [apiSessions, runs, models] = await Promise.all([
          chatbotRepository.getSessions(),
          chatbotRepository.getActiveRuns(),
          chatbotRepository.getModels().catch(() => FALLBACK_MODELS),
        ]);
        setAvailableModels(models);
        const defaultModel = models.find((m) => m.is_default)?.model_id || DEFAULT_MODEL_ID;
        setSelectedModelIdState((previousModelId) => {
          const nextModelId = models.some((m) => m.model_id === previousModelId)
            ? previousModelId
            : defaultModel;
          try {
            localStorage.setItem(LAST_MODEL_KEY, nextModelId);
          } catch {
            // ignore localStorage failures
          }
          return nextModelId;
        });
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
          setLoadingSessionIds((prev) => new Set(prev).add(activeId));
          setIsInitializing(false);

          // 背景 lazy load active session 的 messages
          chatbotRepository
            .getSession(activeId)
            .then((detailed) => {
              setSessions((prev) =>
                prev.map((s) => (s.id === activeId ? detailed : s)),
              );
            })
            .catch(() => { /* ignore, will load on click */ })
            .finally(() => {
              setLoadingSessionIds((prev) => {
                const next = new Set(prev);
                next.delete(activeId);
                return next;
              });
            });
          return;
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
      setLoadingSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(newSession.id);
        return next;
      });
      void refreshSharedSessions();
      onSessionChange?.(newSession.id);
      return newSession.id;
    } catch (err) {
      console.error("Failed to create session:", err);
      setError(i18n.t("chatbot:errors.createSessionFailed"));
      return null;
    }
  }, [setCurrentSessionId, refreshSharedSessions, onSessionChange]);

  /**
   * 刪除 session
   */
  const deleteSession = useCallback(
    async (sessionId: string) => {
      try {
        setError(null);
        await chatbotRepository.deleteSession(sessionId);

        let fallback: string | null = null;
        let shouldCreate = false;
        let shouldCallDeleted = false;

        setSessions((prev) => {
          const filtered = prev.filter((session) => session.id !== sessionId);
          if (sessionId === currentSessionId) {
            fallback = filtered[0]?.id ?? null;
            if (filtered.length > 0) {
              setCurrentSessionId(filtered[0].id);
            } else {
              shouldCreate = true;
            }
            shouldCallDeleted = true;
          } else if (filtered.length === 0) {
            shouldCreate = true;
            shouldCallDeleted = true;
          }
          return filtered;
        });

        if (shouldCreate) void createSession();
        if (shouldCallDeleted) onSessionDeleted?.(fallback);
        void refreshSharedSessions();
      } catch (err) {
        console.error("Failed to delete session:", err);
        setError(i18n.t("chatbot:errors.deleteSessionFailed"));
      }
    },
    [currentSessionId, createSession, setCurrentSessionId, refreshSharedSessions, onSessionDeleted],
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
      setLoadingSessionIds((prev) => new Set(prev).add(sessionId));
      try {
        const detailed = await chatbotRepository.getSession(sessionId);
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? detailed : s)),
        );
      } catch (err) {
        console.warn("Failed to load session messages:", err);
      } finally {
        setLoadingSessionIds((prev) => {
          const next = new Set(prev);
          next.delete(sessionId);
          return next;
        });
      }
    }
  }, [sessions, setCurrentSessionId]);

  // Sync to URL-provided session ID after initialization completes
  useEffect(() => {
    if (!externalSessionId || isInitializing) return;
    // Ignore stale temp session IDs from URL once we've already switched
    // to a persisted backend session ID in memory.
    if (
      externalSessionId.startsWith("temp-")
      && currentSessionId
      && !currentSessionId.startsWith("temp-")
    ) {
      return;
    }
    if (currentSessionId !== externalSessionId) {
      void switchSession(externalSessionId);
    }
  }, [externalSessionId, isInitializing, currentSessionId, switchSession]);

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
        void refreshSharedSessions();
      } catch (err) {
        console.error("Failed to rename session:", err);
        setError(i18n.t("chatbot:errors.renameSessionFailed"));
      }
    },
    [refreshSharedSessions],
  );

  // Derive the active run for the current session once so the subscription
  // effect can depend on stable primitives (id/kind/lastEventSeq) instead of
  // the `activeRuns` array reference. Without this, every setActiveRuns call
  // (e.g., status churn on awaiting_approval) would tear down and rebuild the
  // SSE subscription, causing the backend to replay old events from seq 0.
  const activeRun = useMemo(() => {
    if (!enabled || !currentSessionId) return null;
    return (
      activeRuns.find(
        (run) =>
          run.sessionId === currentSessionId &&
          ["queued", "running", "awaiting_approval"].includes(run.status),
      ) ?? null
    );
  }, [activeRuns, currentSessionId, enabled]);

  useEffect(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    if (!activeRun) {
      setIsStreaming(false);
      setIsLoading(false);
      setSessionNotice(null);
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

    // When resuming after HITL, the last pre-pause event left message.isThinking=false
    // (tool finished / content arrived). Reset it to true immediately so the user
    // sees a running indicator before the first SSE event from the resumed run arrives.
    if (activeRun.status === "running" || activeRun.status === "queued") {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === activeRun.sessionId
            ? applyRunMessageUpdate(session, activeRun, { isThinking: true }, streamedState)
            : session,
        ),
      );
    }

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
        onSessionNotice: (notice) => {
          setSessionNotice(notice);
        },
        onTodoItemsUpdate: (items) => {
          if (!items) return;
          setSessions((prev) =>
            prev.map((session) =>
              session.id === activeRun.sessionId
                ? applyRunMessageUpdate(
                    session,
                    activeRun,
                    { todoItems: items },
                    streamedState,
                  )
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
          setSessionNotice(null);
        },
        onError: (errorMsg) => {
          setError(errorMsg);
          // Transient SSE disconnect should auto-retry; do not drop active run.
          if (errorMsg.startsWith("任務訂閱失敗:")) {
            setSessionNotice("連線中斷，嘗試重新連線…");
            setIsLoading(false);
            if (resubscribeTimerRef.current !== null) {
              window.clearTimeout(resubscribeTimerRef.current);
            }
            resubscribeTimerRef.current = window.setTimeout(() => {
              resubscribeTimerRef.current = null;
              setSubscribeEpoch((n) => n + 1);
            }, 1000);
            return;
          }
          setActiveRuns((prev) => prev.filter((run) => run.id !== activeRun.id));
          setIsStreaming(false);
          setIsLoading(false);
          setSessionNotice(null);
        },
        onAwaitingApproval: (request) => {
          // Do NOT mutate activeRuns here — any churn on the array forces the
          // parent useEffect to tear this subscription down and reopen it,
          // which replays old SSE events and loops. The HITLCard visibility
          // is gated on `pendingApproval`, which is enough by itself.
          setPendingApproval(request);
          setIsLoading(false);
        },
      },
      { signal: controller.signal },
    );

    return () => {
      controller.abort();
    };
    // activeRun is intentionally destructured via primitives so that status
    // changes alone (awaiting_approval) don't tear down the SSE subscription.
    // Only id changes or an explicit epoch bump (after a resume decision) do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRun?.id, subscribeEpoch, enabled]);

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
          onSessionChange?.(newSessionData.id);
        } catch (err) {
          console.error("Failed to create backend session:", err);
          setError(i18n.t("chatbot:errors.createBackendSessionFailed"));
          return;
        }
      }

      setIsStreaming(true);
      setIsLoading(true);
      setError(null);
      setSessionNotice(null);

      // 樂觀更新：立刻顯示 user bubble，不等 API 回來
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionIdForRequest || session.id === currentSessionId
            ? {
                ...session,
                messages: [
                  ...session.messages,
                  {
                    id: `optimistic-${Date.now()}`,
                    role: "user" as const,
                    content: trimmedContent,
                    timestamp: new Date(),
                    toolExecutions: [],
                  },
                ],
              }
            : session,
        ),
      );

      try {
        const run = await chatbotRepository.startRun(
          sessionIdForRequest,
          trimmedContent,
          { context: effectiveContext ?? undefined, modelOverride: selectedModelIdState },
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
        setSessionNotice(null);
      }
    },
    [currentSessionId, effectiveContext, onSessionChange, selectedModelIdState, setCurrentSessionId],
  );


  /**
   * Resume interrupted backend run after approval.
   */
  const resumeAgent = useCallback(
    async (decision: "approve" | "reject") => {
      const activeRun = activeRuns.find(
        (run) =>
          run.sessionId === currentSessionId &&
          ["queued", "running", "awaiting_approval"].includes(run.status),
      );
      if (!activeRun) return;

      setIsStreaming(true);
      setIsLoading(true);

      try {
        const run = await chatbotRepository.submitRunApproval(activeRun.id, decision);
        setActiveRuns((prev) =>
          prev.map((item) => (item.id === run.id ? run : item)),
        );
        // Force the SSE effect to re-subscribe even if id/kind didn't
        // change (e.g., second HITL cycle on the same run).
        setSubscribeEpoch((n) => n + 1);
      } catch (err) {
        console.error("Resume run error:", err);
        setError(i18n.t("chatbot:errors.resumeAgentFailed"));
        setIsStreaming(false);
        setIsLoading(false);
        throw err;
      }
    },
    [activeRuns, currentSessionId],
  );

  /**
   * 提交 HITL 核准決定（核准或拒絕）
   *
   * 只有在 resumeAgent 成功後才關掉 pendingApproval，否則使用者會失去
   * 重新核准的入口（後端 run 仍停在 awaiting_approval、但不會再 replay
   * 該事件，因為 SSE 訂閱要等下一次成功 resume 才會重開）。
   */
  const submitApproval = useCallback(
    async (decision: "approve" | "reject") => {
      if (!currentSessionId) return;
      try {
        await resumeAgent(decision);
        setPendingApproval(null);
      } catch {
        // resumeAgent 已 setError；保留 pendingApproval 讓使用者可以重試
      }
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

    // Abort only the CURRENT subscription immediately. Do not defer this to an
    // async finally block, otherwise a later run may replace the ref and get
    // aborted by mistake (causing "next message has no thinking until refresh").
    const controllerToAbort = abortControllerRef.current;
    abortControllerRef.current = null;
    controllerToAbort?.abort();
    if (resubscribeTimerRef.current !== null) {
      window.clearTimeout(resubscribeTimerRef.current);
      resubscribeTimerRef.current = null;
    }

    // Immediate UI response for cancel click.
    setIsStreaming(false);
    setIsLoading(false);
    setSessionNotice(null);

    if (!activeRun) {
      return;
    }

    // Optimistically mark current assistant run as cancelled so "已停止" appears
    // right away without waiting for backend cancel + session refetch.
    setSessions((prev) =>
      prev.map((session) =>
        session.id === activeRun.sessionId
          ? applyRunMessageUpdate(
              session,
              activeRun,
              { runStatus: "cancelled", isThinking: false },
              { content: "", thinking: "" },
            )
          : session,
      ),
    );
    // Remove from active runs immediately to prevent stale running state.
    setActiveRuns((prev) => prev.filter((item) => item.id !== activeRun.id));

    chatbotRepository.cancelRun(activeRun.id)
      .then((run) => {
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
      });
  }, [activeRuns, currentSessionId]);

  return {
    sessions,
    currentSessionId,
    currentSession,
    isLoading,
    isStreaming,
    isInitializing,
    isSessionLoading,
    error,
    pendingApproval,
    sessionNotice,
    availableModels,
    selectedModelId: selectedModelIdState,
    setSelectedModelId,
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
