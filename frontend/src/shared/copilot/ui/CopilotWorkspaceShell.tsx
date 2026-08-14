import { useState, type ReactNode } from "react";
import { CopilotPanel } from "./CopilotPanel";
import type { CopilotUISlots } from "./copilotUI.types";
import "./copilot.css";

export interface CopilotWorkspaceShellProps { children: ReactNode; defaultOpen?: boolean; disabled?: boolean; side?: "left" | "right"; slots?: CopilotUISlots; className?: string; }
export function CopilotWorkspaceShell({ children, defaultOpen = false, disabled = false, side = "right", slots, className }: CopilotWorkspaceShellProps) {
  const [open, setOpen] = useState(defaultOpen);
  return <div className={`copilot-root copilot-workspace ${className ?? ""}`} data-testid="copilot-workspace" data-side={side}>
    <div className="copilot-workspace-main">{children}</div>
    {!disabled && <aside className="copilot-workspace-panel" data-testid="copilot-panel" hidden={!open}><CopilotPanel slots={slots} /></aside>}
    {!disabled && <button className="copilot-workspace-toggle" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? "Close AI Copilot" : "Open AI Copilot"}</button>}
  </div>;
}
