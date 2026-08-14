import type { CopilotMessage, CopilotRunState } from "@/core/copilot";
import {
  CopilotMessageView,
  type CopilotMessageViewProps,
} from "./CopilotMessageView";

export interface CopilotMessageListProps {
  messages?: readonly CopilotMessage[];
  run?: CopilotRunState;
  className?: string;
  messageComponent?: React.ComponentType<CopilotMessageViewProps>;
}

export function CopilotMessageList({ messages = [], className, messageComponent: Message = CopilotMessageView }: CopilotMessageListProps) {
  return <ol className={`copilot-messages ${className ?? ""}`} role="log" aria-live="polite">{messages.map((message) => <li key={message.id}><Message message={message} /></li>)}</ol>;
}
