import { CopilotMessageView } from "./CopilotMessageView";
import type { CopilotMessageListSlotProps } from "./copilotUI.types";

export interface CopilotMessageListProps extends CopilotMessageListSlotProps {
  className?: string;
}

export function CopilotMessageList({ messages, className, messageComponent: Message = CopilotMessageView }: CopilotMessageListProps) {
  return <ol className={`copilot-messages ${className ?? ""}`} role="log" aria-live="polite">{messages.map((message) => <li key={message.id}><Message message={message} /></li>)}</ol>;
}
