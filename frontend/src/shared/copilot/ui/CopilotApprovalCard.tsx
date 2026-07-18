import type { CopilotApprovalRequest } from "@/core/copilot";

export interface CopilotApprovalCardProps { request: CopilotApprovalRequest; onSubmit(decision: "approve" | "reject"): void; }
export function CopilotApprovalCard({ request, onSubmit }: CopilotApprovalCardProps) {
  return <section className="copilot-interaction" aria-label="Approval required"><p>{request.actions.map((action) => action.name).join(", ")}</p>{request.allowedDecisions.includes("approve") && <button type="button" onClick={() => onSubmit("approve")}>Approve</button>}{request.allowedDecisions.includes("reject") && <button type="button" onClick={() => onSubmit("reject")}>Reject</button>}</section>;
}
