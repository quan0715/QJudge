import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import type { ApprovalRequest, ChatMessage } from "@/core/types/chatbot.types";

interface UseChatScrollToBottomParams {
  /** Scrollable container element (the messages list). */
  containerRef: RefObject<HTMLElement | null>;
  messages: ChatMessage[];
  currentSessionId: string | null;
  isLoading: boolean;
  pendingApproval: ApprovalRequest | null;
  /**
   * Distance from bottom (px) under which we still consider the user as
   * "following" the conversation, so streaming updates keep auto-scrolling.
   */
  nearBottomThreshold?: number;
  /**
   * Distance from bottom (px) over which the floating "scroll to latest"
   * button becomes visible.
   */
  showButtonThreshold?: number;
}

interface UseChatScrollToBottomResult {
  /** Manually trigger a scroll to the latest message (e.g. button click). */
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  /** Whether the floating "scroll to latest" button should be visible. */
  showScrollButton: boolean;
}

/**
 * Single source of truth for "scroll to latest message" behavior in the chat.
 *
 * Triggers handled internally:
 *   - Session switch / initial load → instant jump to bottom
 *   - HITL approval card appears → instant jump
 *   - User just sent a message → forced smooth scroll, even if scrolled up
 *   - New / streaming messages → smooth scroll only if user is near bottom
 *   - Manual button click → smooth scroll via the returned `scrollToBottom`
 */
export function useChatScrollToBottom({
  containerRef,
  messages,
  currentSessionId,
  isLoading,
  pendingApproval,
  nearBottomThreshold = 150,
  showButtonThreshold = 300,
}: UseChatScrollToBottomParams): UseChatScrollToBottomResult {
  const [showScrollButton, setShowScrollButton] = useState(false);
  const lastUserMessageIdRef = useRef<string | null>(null);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const container = containerRef.current;
      if (!container) return;
      container.scrollTo({ top: container.scrollHeight, behavior });
    },
    [containerRef],
  );

  // Schedules two RAFs so newly rendered content (incl. async images) is
  // measured before scrolling.
  const scheduleScrollToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      requestAnimationFrame(() => {
        scrollToBottom(behavior);
        requestAnimationFrame(() => scrollToBottom(behavior));
      });
    },
    [scrollToBottom],
  );

  // Toggle the floating button based on scroll position.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      setShowScrollButton(distanceFromBottom > showButtonThreshold);
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [containerRef, showButtonThreshold]);

  // Session switch / initial load → jump instantly so users land at the latest.
  useLayoutEffect(() => {
    scheduleScrollToBottom("auto");
  }, [currentSessionId, isLoading, scheduleScrollToBottom]);

  // HITL approval card appears → ensure it is visible.
  useLayoutEffect(() => {
    if (!pendingApproval || isLoading) return;
    scheduleScrollToBottom("auto");
  }, [pendingApproval, isLoading, scheduleScrollToBottom]);

  // Message-driven scroll:
  //   - If the user just sent a new message → force scroll (UX guarantee).
  //   - Otherwise (assistant streaming, etc.) → only scroll if near bottom,
  //     so users reading older history aren't yanked away.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let lastUserMessage: ChatMessage | undefined;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "user") {
        lastUserMessage = messages[i];
        break;
      }
    }

    const userJustSent =
      !!lastUserMessage && lastUserMessage.id !== lastUserMessageIdRef.current;
    lastUserMessageIdRef.current = lastUserMessage?.id ?? null;

    if (userJustSent) {
      scheduleScrollToBottom("smooth");
      return;
    }

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < nearBottomThreshold) {
      scheduleScrollToBottom("smooth");
    }
  }, [messages, pendingApproval, scheduleScrollToBottom, containerRef, nearBottomThreshold]);

  return { scrollToBottom, showScrollButton };
}
