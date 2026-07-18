import { CopilotPanel } from "./CopilotPanel";
import type { CopilotUISlots } from "./copilotUI.types";
import "./copilot.css";

export interface CopilotFullPageShellProps { history?: "sidebar" | "drawer" | "hidden"; slots?: CopilotUISlots; className?: string; }
export function CopilotFullPageShell({ history = "sidebar", slots, className }: CopilotFullPageShellProps) {
  return <main className={`copilot-root copilot-full-page ${className ?? ""}`} data-testid="copilot-full-page" data-history={history}><CopilotPanel slots={slots} showHistory={history !== "hidden"} /></main>;
}
