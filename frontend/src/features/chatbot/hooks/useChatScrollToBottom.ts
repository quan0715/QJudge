import type { RefObject } from "react";

import type { ApprovalRequest, ChatMessage } from "@/core/types/chatbot.types";
import { useCopilotScroll } from "@/shared/copilot/hooks/useCopilotScroll";

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
  return useCopilotScroll({
    containerRef,
    messages,
    activeSessionId: currentSessionId,
    loading: isLoading,
    interactionRevision: pendingApproval ? JSON.stringify(pendingApproval) : null,
    nearBottomThreshold,
    showButtonThreshold,
  });
}
