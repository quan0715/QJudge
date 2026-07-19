import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import i18n from "i18next";
import type {
  ChatSession,
  ModelInfo,
  ApprovalRequest,
  QuestionRequest,
  NextTurnOption,
  ChatRun,
} from "@/core/types/chatbot.types";
import { chatbotRepository } from "@/infrastructure/api/repositories";
import { uploadUserArtifact } from "@/infrastructure/api/repositories/artifact.repository";
import { applyRunMessageUpdate } from "../lib/chatbotLegacyMerge";

export { applyRunMessageUpdate } from "../lib/chatbotLegacyMerge";
export type { StreamedRunState } from "../lib/chatbotLegacyMerge";

export interface UseChatbotReturn {
  sessions: ChatSession[];
  currentSessionId: string | null;
  currentSession: ChatSession | null;
  isLoading: boolean;
  isStreaming: boolean;
  isInitializing: boolean;
  isLoadingSessions: boolean;
  isSessionLoading: boolean;
  error: string | null;
  pendingApproval: ApprovalRequest | null;
  pendingQuestion: QuestionRequest | null;
  nextTurnOptions: NextTurnOption[] | null;
  sessionNotice: string | null;
  availableModels: ModelInfo[];
  selectedModelId: string;
  activeRuns: ChatRun[];
  setSelectedModelId: (modelId: string) => void;
  createSession: () => Promise<string | null>;
  deleteSession: (sessionId: string) => Promise<void>;
  switchSession: (sessionId: string) => void;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  sendMessage: (content: string, pendingFiles?: File[]) => Promise<boolean>;
  uploadArtifact: (file: File) => Promise<void>;
  stopStreaming: () => void;
  refreshSessions: () => Promise<void>;
  submitApproval: (decision: "approve" | "reject") => Promise<void>;
  dismissApproval: () => void;
  submitAnswer: (answer: string) => Promise<void>;
  dismissQuestion: () => void;
  clearError: () => void;
}

export interface UseChatbotOptions {
  /** 是否啟用（延遲初始化用） */
  enabled?: boolean;
  /**
   * 初始化時優先使用這個 session id（通常來自 URL `?ai_session_id=`）。
   * 比 localStorage 的 last session 優先。沒提供時 fallback 到 localStorage → 列表第一筆。
   */
  initialSessionIdHint?: string | null;
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
    model_id: "openai-mini",
    display_name: "gpt-5.4-mini (low)",
    description: "OpenAI 推理模型，低思考強度，平衡速度與品質",
    is_default: false,
  },
  {
    model_id: "openai-mini-medium",
    display_name: "gpt-5.4-mini (medium)",
    description: "OpenAI 推理模型，中等思考強度，適合複雜批改與推理",
    is_default: false,
  },
  {
    model_id: "deepseek-v4",
    display_name: "deepseek-v4",
    description: "1M context、快速、低成本，適合日常對話與 summarization（非推理模式）",
    is_default: false,
  },
  {
    model_id: "deepseek-v4-thinking",
    display_name: "deepseek-v4 (thinking)",
    description: "1M context、推理模式（reasoning_effort=low），適合複雜批改與測資生成",
    is_default: false,
  },
];

export function useLegacyChatbotRuntime(options: UseChatbotOptions = {}): UseChatbotReturn {
  const { enabled = true, initialSessionIdHint = null } = options;
  // hint 只在 init 階段使用一次；後續 URL 變動由 ChatbotProvider 的 effect 處理。
  // 用 ref 凍結首次進 init() 時的值，避免 hint 在 init 跑到一半被 URL 改變打斷。
  const initialHintRef = useRef(initialSessionIdHint);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
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
  const [pendingQuestion, setPendingQuestion] =
    useState<QuestionRequest | null>(null);
  const [nextTurnOptions, setNextTurnOptions] =
    useState<NextTurnOption[] | null>(null);
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
    setIsLoadingSessions(true);
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
    } finally {
      setIsLoadingSessions(false);
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
      setIsLoadingSessions(true);
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
          // 優先序：URL hint > localStorage saved > 列表第一筆
          const hintSession = initialHintRef.current
            ? sessionsWithRuns.find((s) => s.id === initialHintRef.current)
            : null;
          const savedSession = savedSessionId
            ? sessionsWithRuns.find((s) => s.id === savedSessionId)
            : null;
          const activeId =
            hintSession?.id ?? savedSession?.id ?? sessionsWithRuns[0].id;

          setSessions(sessionsWithRuns);
          setCurrentSessionId(activeId);
          setLoadingSessionIds((prev) => new Set(prev).add(activeId));
          setIsInitializing(false);
          setIsLoadingSessions(false);

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
        setIsLoadingSessions(false);
        return;
      }

      setIsInitializing(false);
      setIsLoadingSessions(false);
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
      return newSession.id;
    } catch (err) {
      console.error("Failed to create session:", err);
      setError(i18n.t("chatbot:errors.createSessionFailed"));
      return null;
    }
  }, [setCurrentSessionId]);

  /**
   * 切換 session（lazy load messages）
   */
  const switchSession = useCallback(async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setPendingApproval(null);

    // Lazy load messages if not yet loaded
    const existing = sessions.find((s) => s.id === sessionId);
    if (!existing && !sessionId.startsWith("temp-")) {
      setLoadingSessionIds((prev) => new Set(prev).add(sessionId));
      try {
        const detailed = await chatbotRepository.getSession(sessionId);
        setSessions((prev) => {
          if (prev.some((s) => s.id === sessionId)) {
            return prev.map((s) => (s.id === sessionId ? detailed : s));
          }
          return [detailed, ...prev];
        });
      } catch (err) {
        console.warn("Failed to load requested session:", err);
      } finally {
        setLoadingSessionIds((prev) => {
          const next = new Set(prev);
          next.delete(sessionId);
          return next;
        });
      }
      return;
    }
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

  /**
   * 刪除 session
   */
  const deleteSession = useCallback(
    async (sessionId: string) => {
      try {
        setError(null);
        await chatbotRepository.deleteSession(sessionId);

        const remainingSessions = sessions.filter(
          (session) => session.id !== sessionId,
        );
        const fallbackSessionId =
          sessionId === currentSessionId
            ? remainingSessions[0]?.id ?? null
            : null;
        const shouldCreate = remainingSessions.length === 0;

        setSessions((prev) =>
          prev.filter((session) => session.id !== sessionId),
        );

        // 走 switchSession 而不是 setCurrentSessionId，讓 fallback session 也會 lazy-load
        // messages；否則 sessions list 裡的 messages 永遠是 getSessions() 給的空陣列，
        // 使用者會看到預設 welcome 畫面直到 refresh。
        if (fallbackSessionId) void switchSession(fallbackSessionId);
        if (shouldCreate) {
          setCurrentSessionId(null);
          void createSession();
        }
      } catch (err) {
        console.error("Failed to delete session:", err);
        setError(i18n.t("chatbot:errors.deleteSessionFailed"));
      }
    },
    [currentSessionId, createSession, sessions, setCurrentSessionId, switchSession],
  );

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
          // Run 已進入 terminal state（completed / failed / cancelled），無論先前
          // 是否停在 awaiting_approval / awaiting_user_answer，HITL 卡片都必須清掉，
          // 不然使用者看到的是「任務失敗」但卡片還留著，點按鈕會對不到活 run 變成卡死。
          setPendingApproval(null);
          setPendingQuestion(null);
          // Fallback: if SSE didn't carry onNextTurnOptions for this run
          // (e.g. tool-based path), read them off the LATEST assistant
          // message only. Walking back to the first assistant with options
          // would resurrect chips from an earlier turn that the user has
          // already answered — classic stale-chip bug.
          if (!nextTurnOptions) {
            const lastAssistant = [...(freshSession.messages ?? [])]
              .reverse()
              .find((m) => m.role === "assistant");
            if (lastAssistant?.nextTurnOptions?.length) {
              setNextTurnOptions(lastAssistant.nextTurnOptions);
            }
          }
        },
        onError: (errorMsg) => {
          setError(errorMsg);
          // Transient SSE disconnect should auto-retry; do not drop active run
          // or pending HITL cards — the resubscribed stream will replay them.
          if (errorMsg.startsWith("任務訂閱失敗:")) {
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
          // run_failed 結束 run 時也要清 HITL，避免殘留卡片誤導使用者（見 onComplete 註解）。
          setPendingApproval(null);
          setPendingQuestion(null);
        },
        onAwaitingApproval: (request) => {
          // Do NOT mutate activeRuns here — any churn on the array forces the
          // parent useEffect to tear this subscription down and reopen it,
          // which replays old SSE events and loops. The HITLCard visibility
          // is gated on `pendingApproval`, which is enough by itself.
          setPendingApproval(request);
          setIsLoading(false);
        },
        onAwaitingUserAnswer: (request) => {
          setPendingQuestion(request);
          setIsLoading(false);
        },
        onNextTurnOptions: (options) => {
          setNextTurnOptions(options);
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
    async (content: string, pendingFiles: File[] = []) => {
      if (!content.trim() || !currentSessionId) return false;

      setNextTurnOptions(null);
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
          return false;
        }
      }

      setIsStreaming(true);
      setIsLoading(true);
      setError(null);
      setSessionNotice(null);

      try {
        for (const file of pendingFiles) {
          await uploadUserArtifact(sessionIdForRequest, file);
        }

        // 樂觀更新：artifact 上傳成功後立刻顯示 user bubble，不等 run API 回來
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

        const run = await chatbotRepository.startRun(
          sessionIdForRequest,
          trimmedContent,
          { modelOverride: selectedModelIdState },
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
        return true;
      } catch (err) {
        console.error("Failed to start AI run:", err);
        setError(
          pendingFiles.length > 0
            ? i18n.t("chatbot:errors.uploadArtifactFailed", "無法上傳附件")
            : i18n.t("chatbot:errors.sendMessageFailed"),
        );
        setIsStreaming(false);
        setIsLoading(false);
        setSessionNotice(null);
        return false;
      }
    },
    [currentSessionId, selectedModelIdState, setCurrentSessionId],
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
   * 提交用戶回答（回覆 agent 的提問）
   */
  const submitAnswer = useCallback(
    async (answer: string) => {
      const run = activeRuns.find(
        (r) =>
          r.sessionId === currentSessionId &&
          r.status === "awaiting_user_answer",
      );
      if (!run) return;

      setIsStreaming(true);
      setIsLoading(true);

      try {
        const updatedRun = await chatbotRepository.submitRunAnswer(run.id, answer);
        setActiveRuns((prev) =>
          prev.map((item) => (item.id === updatedRun.id ? updatedRun : item)),
        );
        setSubscribeEpoch((n) => n + 1);
        setPendingQuestion(null);
      } catch (err) {
        console.error("Submit answer error:", err);
        setError(i18n.t("chatbot:errors.submitAnswerFailed", "無法提交回答"));
        setIsStreaming(false);
        setIsLoading(false);
      }
    },
    [activeRuns, currentSessionId],
  );

  /**
   * 關閉提問卡片（不回答）
   */
  const dismissQuestion = useCallback(() => {
    setPendingQuestion(null);
  }, []);

  const uploadArtifact = useCallback(async (file: File) => {
    const sessionId = currentSessionId;
    if (!sessionId) return;
    try {
      setError(null);
      await uploadUserArtifact(sessionId, file);
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                messages: [
                  ...session.messages,
                  {
                    id: `upload-${Date.now()}`,
                    role: "assistant",
                    content: `已上傳檔案 ${file.name}`,
                    timestamp: new Date(),
                  },
                ],
              }
            : session,
        ),
      );
    } catch (err) {
      console.error("Failed to upload artifact:", err);
      setError(i18n.t("chatbot:errors.uploadArtifactFailed", "無法上傳附件"));
    }
  }, [currentSessionId]);

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
    isLoadingSessions,
    isSessionLoading,
    error,
    pendingApproval,
    pendingQuestion,
    nextTurnOptions,
    sessionNotice,
    availableModels,
    selectedModelId: selectedModelIdState,
    activeRuns,
    setSelectedModelId,
    createSession,
    deleteSession,
    switchSession,
    renameSession,
    sendMessage,
    uploadArtifact,
    stopStreaming,
    refreshSessions,
    submitApproval,
    dismissApproval,
    submitAnswer,
    dismissQuestion,
    clearError,
  };
}

export default useLegacyChatbotRuntime;
