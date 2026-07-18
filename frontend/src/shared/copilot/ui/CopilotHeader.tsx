import type { CopilotActiveSessionState, CopilotRunState } from "@/core/copilot";

export interface CopilotHeaderProps {
  activeSession: CopilotActiveSessionState;
  run: CopilotRunState;
  onNewSession(): void;
  onToggleHistory?(): void;
}

export function CopilotHeader({ activeSession, onNewSession, onToggleHistory }: CopilotHeaderProps) {
  return (
    <header className="copilot-header">
      {onToggleHistory && <button type="button" onClick={onToggleHistory} aria-label="Toggle chat history">History</button>}
      <h2>{activeSession.data?.title ?? "AI Copilot"}</h2>
      <button type="button" onClick={onNewSession}>New chat</button>
    </header>
  );
}
