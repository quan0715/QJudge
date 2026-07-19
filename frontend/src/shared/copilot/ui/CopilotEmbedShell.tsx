import type { ReactNode } from "react";
import { CopilotPanel } from "./CopilotPanel";
import type { CopilotUISlots } from "./copilotUI.types";
import "./copilot.css";

export interface CopilotEmbedShellProps { showHeader?: boolean; showHistory?: boolean; slots?: CopilotUISlots; className?: string; children?: ReactNode; }
export function CopilotEmbedShell({ showHeader = true, showHistory = false, slots, className, children }: CopilotEmbedShellProps) {
  return <section className={`copilot-root copilot-embed ${className ?? ""}`} data-testid="copilot-embed" data-container-safe="true">{children ?? <CopilotPanel showHeader={showHeader} showHistory={showHistory} slots={slots} />}</section>;
}
