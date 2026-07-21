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
import { useCopilotSessions } from "@copilot";
import { selectFinishedArtifactToolIds } from "../adapters/qJudgeCopilotMessageData";

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
  children,
}: ArtifactPanelProviderProps) {
  const { activeSession } = useCopilotSessions();
  const sessionId = activeSession.status === "ready" ? activeSession.id : null;
  const [isOpen, setIsOpen] = useState(false);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seenToolCallIds = useRef(new Set<string>());
  const refreshSeq = useRef(0);
  // Debounce timer for burst coalescing.
  const refreshTimerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current;
    if (!sessionId) {
      setArtifacts([]);
      setError(null);
      setIsLoading(false);
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
      if (seq === refreshSeq.current) {
        setIsLoading(false);
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
  useEffect(() => {
    const messages = activeSession.status === "ready" ? activeSession.data.messages : [];
    for (const toolCallId of selectFinishedArtifactToolIds(messages)) {
      if (seenToolCallIds.current.has(toolCallId)) continue;
      seenToolCallIds.current.add(toolCallId);
      scheduleRefresh();
    }
  }, [activeSession, scheduleRefresh]);

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
