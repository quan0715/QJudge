import type { CopilotMessage } from "@/core/copilot";

export interface CopilotMessageViewProps {
  message: CopilotMessage;
}

export function CopilotMessageView({ message }: CopilotMessageViewProps) {
  return (
    <article className="copilot-message" data-role={message.role} aria-label={`${message.role} message`}>
      {message.parts.map((part, index) => {
        if (part.type === "text") return <p key={index}>{part.text}</p>;
        if (part.type === "reasoning") return <details key={index}><summary>Reasoning</summary><p>{part.text}</p></details>;
        if (part.type === "attachment") return <span key={index}>Attachment: {part.name}</span>;
        if (part.type === "tool") return <div key={index} role="status">Tool {part.toolName}: {part.state}</div>;
        return <div key={index} role="status">Additional AI data</div>;
      })}
    </article>
  );
}
