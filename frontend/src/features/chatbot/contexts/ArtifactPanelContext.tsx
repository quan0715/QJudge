/**
 * Artifact side-panel state scoped to a single chat session.
 *
 * Responsibilities:
 * - Track which artifact (if any) is currently selected for preview.
 * - Track panel open/closed state (desktop split / mobile bottom sheet).
 * - Own the list of artifacts for the current session + a refresh hook.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  listArtifacts,
  type ArtifactRecord,
} from "@/infrastructure/api/repositories/artifact.repository";
import { useOptionalChatbotContext } from "./ChatbotProvider";

interface ArtifactPanelContextValue {
  isOpen: boolean;
  open: (artifactId?: string) => void;
  close: () => void;
  toggle: () => void;
  activeArtifactId: string | null;
  setActiveArtifactId: (id: string | null) => void;

  artifacts: ArtifactRecord[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;

  /** Hint from ChainOfThought: a new artifact_write/read finished. */
  markToolFinished: (toolName: string) => void;
}

const ArtifactPanelContext = createContext<ArtifactPanelContextValue | null>(null);

interface ArtifactPanelProviderProps {
  sessionId: string | null;
  children: ReactNode;
}

function isArtifactToolName(toolName: string): boolean {
  return toolName.startsWith("artifact_");
}

// Trailing-edge debounce for burst refreshes triggered by the agent firing
// a cluster of artifact_* tool calls in one turn (e.g. seed + 20-row patch).
// 250ms is long enough to collapse an agent burst into a single fetch and
// short enough to feel live to the user.
const REFRESH_DEBOUNCE_MS = 250;

export function ArtifactPanelProvider({
  sessionId,
  children,
}: ArtifactPanelProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seenToolCallIds = useRef(new Set<string>());
  const refreshSeq = useRef(0);
  // Debounce timer for burst coalescing.
  const refreshTimerRef = useRef<number | null>(null);
  // In-flight guard: if a fetch is already running, remember that another
  // refresh was requested and run it once the current one settles.
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) {
      // Coalesce: whoever finishes the in-flight call will re-run once.
      refreshQueuedRef.current = true;
      return;
    }
    refreshInFlightRef.current = true;
    const seq = ++refreshSeq.current;
    if (!sessionId) {
      setArtifacts([]);
      setError(null);
      setIsLoading(false);
      refreshInFlightRef.current = false;
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const records = await listArtifacts({ sessionId });
      if (seq !== refreshSeq.current) return;
      setArtifacts(records);
    } catch (err) {
      if (seq !== refreshSeq.current) return;
      setError(err instanceof Error ? err.message : "Failed to load artifacts");
    } finally {
      refreshInFlightRef.current = false;
      if (seq === refreshSeq.current) {
        setIsLoading(false);
      }
      // Drain any refresh that was requested while this one was running.
      if (refreshQueuedRef.current) {
        refreshQueuedRef.current = false;
        void refresh();
      }
    }
  }, [sessionId]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current != null) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void refresh();
    }, REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  // Load on session change + reset selection
  useEffect(() => {
    refreshSeq.current += 1; // invalidate in-flight requests from previous session
    seenToolCallIds.current = new Set();
    if (refreshTimerRef.current != null) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    refreshQueuedRef.current = false;
    setIsOpen(false);
    setActiveArtifactId(null);
    setArtifacts([]);
    setError(null);
    setIsLoading(Boolean(sessionId));
    void refresh();
  }, [sessionId, refresh]);

  // Flush pending debounced timer on unmount.
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current != null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, []);

  const markToolFinished = useCallback(
    (toolName: string) => {
      if (!isArtifactToolName(toolName)) return;
      scheduleRefresh();
    },
    [scheduleRefresh],
  );

  // Auto-watch the current session's messages for finished artifact_* tool calls.
  // Previously this was done inside ChatContainerBody, which is only mounted when
  // the right chat panel is open. Consumers like AI Grading read `artifacts` for
  // progress tracking even when the chat panel is closed — so the refresh trigger
  // must live here, where the provider stays mounted for the whole session.
  const chatbot = useOptionalChatbotContext();
  const currentSessionMessages =
    chatbot?.currentSession?.id === sessionId
      ? chatbot?.currentSession?.messages
      : undefined;
  useEffect(() => {
    if (!currentSessionMessages) return;
    for (const message of currentSessionMessages) {
      const execs = message.toolExecutions ?? [];
      for (const step of execs) {
        if (!step.toolCallId || !step.toolName) continue;
        if (!isArtifactToolName(step.toolName)) continue;
        if (step.result === undefined && !step.isError) continue;
        if (seenToolCallIds.current.has(step.toolCallId)) continue;
        seenToolCallIds.current.add(step.toolCallId);
        scheduleRefresh();
      }
    }
  }, [currentSessionMessages, scheduleRefresh]);

  const open = useCallback((artifactId?: string) => {
    setIsOpen(true);
    if (artifactId) setActiveArtifactId(artifactId);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((v) => !v);
  }, []);

  const value = useMemo<ArtifactPanelContextValue>(
    () => ({
      isOpen,
      open,
      close,
      toggle,
      activeArtifactId,
      setActiveArtifactId,
      artifacts,
      isLoading,
      error,
      refresh,
      markToolFinished,
    }),
    [
      isOpen,
      open,
      close,
      toggle,
      activeArtifactId,
      artifacts,
      isLoading,
      error,
      refresh,
      markToolFinished,
    ],
  );

  return (
    <ArtifactPanelContext.Provider value={value}>
      {children}
    </ArtifactPanelContext.Provider>
  );
}

export function useArtifactPanel(): ArtifactPanelContextValue {
  const ctx = useContext(ArtifactPanelContext);
  if (!ctx) {
    throw new Error("useArtifactPanel must be used inside ArtifactPanelProvider");
  }
  return ctx;
}

/** Safe variant that returns null when no provider is mounted (e.g. sidebar mode). */
export function useOptionalArtifactPanel(): ArtifactPanelContextValue | null {
  return useContext(ArtifactPanelContext);
}
