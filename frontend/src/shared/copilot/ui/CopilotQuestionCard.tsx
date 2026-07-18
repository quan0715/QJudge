import { useState } from "react";
import type { CopilotQuestionRequest } from "@/core/copilot";

export interface CopilotQuestionCardProps { request: CopilotQuestionRequest; onSubmit(answer: string): void; }
export function CopilotQuestionCard({ request, onSubmit }: CopilotQuestionCardProps) {
  const [answer, setAnswer] = useState("");
  return <section className="copilot-interaction" aria-label="Question"><p>{request.question}</p>{request.input === "choice" ? request.options?.map((option) => <button type="button" key={option} onClick={() => onSubmit(option)}>{option}</button>) : <form onSubmit={(event) => { event.preventDefault(); onSubmit(answer); }}><input aria-label={request.question} value={answer} onChange={(event) => setAnswer(event.target.value)} /><button type="submit" disabled={!answer.trim()}>Submit</button></form>}</section>;
}
