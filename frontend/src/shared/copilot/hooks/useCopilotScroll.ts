import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

export interface CopilotScrollMessage {
  id: string;
  role: "user" | "assistant" | "system";
}

export interface UseCopilotScrollParams {
  containerRef: RefObject<HTMLElement | null>;
  messages: readonly CopilotScrollMessage[];
  activeSessionId: string | null;
  loading: boolean;
  interactionRevision?: number | string | null;
  nearBottomThreshold?: number;
  showButtonThreshold?: number;
}

export interface UseCopilotScrollResult {
  scrollToBottom(behavior?: ScrollBehavior): void;
  showScrollButton: boolean;
}

export function useCopilotScroll({
  containerRef,
  messages,
  activeSessionId,
  loading,
  interactionRevision,
  nearBottomThreshold = 150,
  showButtonThreshold = 300,
}: UseCopilotScrollParams): UseCopilotScrollResult {
  const [showScrollButton, setShowScrollButton] = useState(false);
  const lastUserMessageIdRef = useRef<string | null>(null);
  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const container = containerRef.current;
      if (container) container.scrollTo({ top: container.scrollHeight, behavior });
    },
    [containerRef],
  );
  const scheduleScrollToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      requestAnimationFrame(() => {
        scrollToBottom(behavior);
        requestAnimationFrame(() => scrollToBottom(behavior));
      });
    },
    [scrollToBottom],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
      setShowScrollButton(distance > showButtonThreshold);
    };
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [containerRef, showButtonThreshold]);

  useLayoutEffect(() => {
    scheduleScrollToBottom("auto");
  }, [activeSessionId, loading, scheduleScrollToBottom]);

  useLayoutEffect(() => {
    if (interactionRevision == null || loading) return;
    scheduleScrollToBottom("auto");
  }, [interactionRevision, loading, scheduleScrollToBottom]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    const userJustSent = !!lastUser && lastUser.id !== lastUserMessageIdRef.current;
    lastUserMessageIdRef.current = lastUser?.id ?? null;
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (userJustSent || distance < nearBottomThreshold) {
      scheduleScrollToBottom("smooth");
    }
  }, [containerRef, messages, nearBottomThreshold, scheduleScrollToBottom]);

  return { scrollToBottom, showScrollButton };
}
