import type { CopilotApprovalRequest, CopilotError } from "@/core/copilot";

export interface CopilotApprovalCardProps {
  request: CopilotApprovalRequest;
  interactionError?: CopilotError;
  onSubmit(decision: "approve" | "reject"): void;
}
export function CopilotApprovalCard({ request, interactionError, onSubmit }: CopilotApprovalCardProps) {
  return <section className="copilot-interaction" aria-label="Approval required"><p>{request.actions.map((action) => action.name).join(", ")}</p>{interactionError && <p role="alert">{interactionError.message ?? "Unable to submit approval."}</p>}{request.allowedDecisions.includes("approve") && <button type="button" onClick={() => onSubmit("approve")}>Approve</button>}{request.allowedDecisions.includes("reject") && <button type="button" onClick={() => onSubmit("reject")}>Reject</button>}</section>;
}
