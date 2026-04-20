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

const ARTIFACT_TOOL_NAMES = new Set(["artifact_write", "artifact_read", "artifact_list"]);

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

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setArtifacts([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const records = await listArtifacts({ sessionId });
      setArtifacts(records);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load artifacts");
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  // Load on session change + reset selection
  useEffect(() => {
    seenToolCallIds.current = new Set();
    setActiveArtifactId(null);
    void refresh();
  }, [sessionId, refresh]);

  const markToolFinished = useCallback(
    (toolName: string) => {
      if (!ARTIFACT_TOOL_NAMES.has(toolName)) return;
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
