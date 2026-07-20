import { useState } from "react";
import type { CopilotError, CopilotQuestionRequest } from "@/core/copilot";

export interface CopilotQuestionCardProps {
  request: CopilotQuestionRequest;
  interactionError?: CopilotError;
  onSubmit(answer: string): void;
}
export function CopilotQuestionCard({ request, interactionError, onSubmit }: CopilotQuestionCardProps) {
  const [answer, setAnswer] = useState("");
  return <section className="copilot-interaction" aria-label="Question"><p>{request.question}</p>{interactionError && <p role="alert">{interactionError.message ?? "Unable to submit answer."}</p>}{request.input === "choice" ? request.options?.map((option) => <button type="button" key={option} onClick={() => onSubmit(option)}>{option}</button>) : <form onSubmit={(event) => { event.preventDefault(); onSubmit(answer); }}><input aria-label={request.question} value={answer} onChange={(event) => setAnswer(event.target.value)} /><button type="submit" disabled={!answer.trim()}>Submit</button></form>}</section>;
}
