import { useMemo } from "react";

import type { CopilotMessage } from "@copilot";
import { selectLatestTodoItems } from "@/features/chatbot/adapters/qJudgeCopilotMessageData";
import { useOptionalArtifactPanel } from "@/features/chatbot/contexts/ArtifactPanelContext";

/** Aggregate whether the current session has any todos / artifacts to show. */
export function useSessionBadgeSummary(
  messages: readonly CopilotMessage[],
): {
  hasTodos: boolean;
  hasArtifacts: boolean;
  hasAny: boolean;
} {
  const artifactCtx = useOptionalArtifactPanel();
  const todos = useMemo(() => selectLatestTodoItems(messages), [messages]);
  const hasTodos = todos.length > 0;
  const hasArtifacts = (artifactCtx?.artifacts.length ?? 0) > 0;
  return { hasTodos, hasArtifacts, hasAny: hasTodos || hasArtifacts };
}
