import { useCopilotRun } from "../hooks/useCopilotRun";
import { useCopilotSessions } from "../hooks/useCopilotSessions";
import { CopilotApprovalCard } from "./CopilotApprovalCard";
import { CopilotComposer } from "./CopilotComposer";
import { CopilotHeader } from "./CopilotHeader";
import { CopilotHistoryPanel } from "./CopilotHistoryPanel";
import { CopilotMessageList } from "./CopilotMessageList";
import { CopilotQuestionCard } from "./CopilotQuestionCard";
import type { CopilotUISlots } from "./copilotUI.types";

export interface CopilotPanelProps { showHeader?: boolean; showHistory?: boolean; slots?: CopilotUISlots; }
export function CopilotPanel({ showHeader = true, showHistory = false, slots = {} }: CopilotPanelProps) {
  const sessions = useCopilotSessions();
  const run = useCopilotRun();
  const Header = slots.header ?? CopilotHeader;
  const Composer = slots.composer ?? CopilotComposer;
  const Approval = slots.approval ?? CopilotApprovalCard;
  const Question = slots.question ?? CopilotQuestionCard;
  const Empty = slots.emptyState;
  const ErrorState = slots.errorState;
  const messages = sessions.activeSession.data?.messages ?? [];
  return <section className="copilot-panel-content">
    {showHeader && <Header activeSession={sessions.activeSession} run={run.state} onNewSession={() => void sessions.create()} />}
    <div className="copilot-panel-body">
      {showHistory && <CopilotHistoryPanel />}
      <div className="copilot-conversation">
        {sessions.activeSession.status === "error" && ErrorState ? <ErrorState error={sessions.activeSession.error} onRetry={() => void sessions.refresh()} /> : messages.length === 0 && Empty ? <Empty onNewSession={() => void sessions.create()} /> : <CopilotMessageList messages={messages} run={run.state} messageComponent={slots.message} />}
        {run.state.status === "awaiting-approval" && <Approval request={run.state.request} onSubmit={(decision) => void run.submitApproval(decision)} />}
        {run.state.status === "awaiting-answer" && <Question request={run.state.request} onSubmit={(answer) => void run.submitAnswer(answer)} />}
        {run.state.status === "error" && ErrorState && <ErrorState error={run.state.error} onRetry={() => void run.retry()} />}
        <Composer />
      </div>
    </div>
  </section>;
}
