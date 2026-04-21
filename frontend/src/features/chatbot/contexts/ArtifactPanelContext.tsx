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
      if (seq !== refreshSeq.current) return;
      setIsLoading(false);
    }
  }, [sessionId]);

  // Load on session change + reset selection
  useEffect(() => {
    refreshSeq.current += 1; // invalidate in-flight requests from previous session
    seenToolCallIds.current = new Set();
    setIsOpen(false);
    setActiveArtifactId(null);
    setArtifacts([]);
    setError(null);
    setIsLoading(Boolean(sessionId));
    void refresh();
  }, [sessionId, refresh]);

  const markToolFinished = useCallback(
    (toolName: string) => {
      if (!isArtifactToolName(toolName)) return;
      void refresh();
    },
    [refresh],
  );

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
