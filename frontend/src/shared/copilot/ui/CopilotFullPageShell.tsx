import type { ReactNode } from "react";
import { CopilotPanel } from "./CopilotPanel";
import type { CopilotUISlots } from "./copilotUI.types";
import "./copilot.css";

export interface CopilotFullPageShellProps { history?: "sidebar" | "drawer" | "hidden"; slots?: CopilotUISlots; className?: string; children?: ReactNode; }
export function CopilotFullPageShell({ history = "sidebar", slots, className, children }: CopilotFullPageShellProps) {
  return <main className={`copilot-root copilot-full-page ${className ?? ""}`} data-testid="copilot-full-page" data-history={history}>{children ?? <CopilotPanel slots={slots} showHistory={history !== "hidden"} />}</main>;
}
