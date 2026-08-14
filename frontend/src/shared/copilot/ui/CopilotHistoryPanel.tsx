import { useCopilotSessions } from "../hooks/useCopilotSessions";

export function CopilotHistoryPanel() {
  const { sessions, activeSession, select } = useCopilotSessions();
  return <nav className="copilot-history" aria-label="Chat history"><ol>{sessions.map((session) => <li key={session.id}><button type="button" aria-current={activeSession.id === session.id ? "page" : undefined} onClick={() => void select(session.id)}>{session.title}</button></li>)}</ol></nav>;
}
