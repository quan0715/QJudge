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
import { useLocation } from "react-router-dom";
import type { PageContext } from "@/core/types/chatbot.types";
import { usePageContextSegments } from "@/shared/contexts/PageContextProvider";

interface PageContextAttachmentValue {
  /** Chip text; null when nothing is attached to the next message. */
  label: string | null;
  dismiss(): void;
  /** Run metadata for the message being sent; re-arms attachment afterwards. */
  takeRunMetadata(): Record<string, unknown>;
}

const NO_ATTACHMENT: PageContextAttachmentValue = {
  label: null,
  dismiss: () => undefined,
  takeRunMetadata: () => ({}),
};

const PageContextAttachmentContext =
  createContext<PageContextAttachmentValue>(NO_ATTACHMENT);

export function PageContextAttachmentProvider({ children }: { children: ReactNode }) {
  const segments = usePageContextSegments();
  const location = useLocation();
  const contestId =
    segments.find((segment) => segment.type === "contest")?.ids.contest_id ?? null;
  const [dismissed, setDismissed] = useState(false);
  const [trackedContestId, setTrackedContestId] = useState(contestId);
  if (trackedContestId !== contestId) {
    setTrackedContestId(contestId);
    setDismissed(false);
  }

  const path = `${location.pathname}${location.search}`;
  const latest = useRef({ segments, dismissed, path });
  useEffect(() => {
    latest.current = { segments, dismissed, path };
  }, [segments, dismissed, path]);

  const dismiss = useCallback(() => setDismissed(true), []);
  const takeRunMetadata = useCallback((): Record<string, unknown> => {
    const current = latest.current;
    setDismissed(false);
    if (current.dismissed || current.segments.length === 0) return {};
    const pageContext: PageContext = {
      path: current.path,
      segments: [...current.segments],
    };
    return { pageContext };
  }, []);

  const label =
    dismissed || segments.length === 0
      ? null
      : segments.map((segment) => segment.label).join(" / ");
  const value = useMemo(
    () => ({ label, dismiss, takeRunMetadata }),
    [label, dismiss, takeRunMetadata],
  );

  return (
    <PageContextAttachmentContext.Provider value={value}>
      {children}
    </PageContextAttachmentContext.Provider>
  );
}

export function usePageContextAttachment(): PageContextAttachmentValue {
  return useContext(PageContextAttachmentContext);
}
