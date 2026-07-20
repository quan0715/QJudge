import type { CopilotUISlots } from "@copilot";

import { HITLCard } from "./HITLCard";
import { MessageBubble } from "./MessageBubble";
import { MessageList } from "./MessageList";
import { NextTurnChips } from "./NextTurnChips";
import {
  QJudgeCopilotComposer,
  QJudgeCopilotEmptyState,
  QJudgeCopilotErrorState,
  QJudgeCopilotHeader,
  QJudgeCopilotHistory,
} from "./QJudgeCopilotSlotComponents";
import { QuestionCard } from "./QuestionCard";

export const qJudgeCopilotSlots = Object.freeze({
  header: QJudgeCopilotHeader,
  history: QJudgeCopilotHistory,
  messageList: MessageList,
  message: MessageBubble,
  suggestions: NextTurnChips,
  composer: QJudgeCopilotComposer,
  approval: HITLCard,
  question: QuestionCard,
  emptyState: QJudgeCopilotEmptyState,
  errorState: QJudgeCopilotErrorState,
}) satisfies CopilotUISlots;
