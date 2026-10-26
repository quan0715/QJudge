import { IconButton } from "@carbon/react";
import { AiLaunch } from "@carbon/icons-react";
import { useCopilotRun } from "@copilot";
import { ThinkingPen } from "@/shared/ui/ThinkingPen";
import { useRequestCopilot } from "@/features/chatbot/contexts/CopilotDemandContext";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "@/features/app/contexts/WorkspaceContext";
import styles from "./AiAssistantNavButton.module.scss";

/** Opens and closes the AI assistant panel from the top navigation. */
export function AiAssistantNavButton() {
  const { t } = useTranslation("common");
  const { right } = useWorkspace();
  const { state } = useCopilotRun();
  const isRunning = state.status === "submitted" || state.status === "streaming";
  // Continue observing an active run when the chat panel is collapsed.
  useRequestCopilot(isRunning);
  const label = t("workspaceTopNav.aiAssistant", "AI 助教");
  if (!right.isAllowed || right.isDisabled) return null;

  return (
    <IconButton
      kind="ghost"
      size="lg"
      align="bottom"
      label={isRunning ? `${label} · ${t("action.processing", "處理中")}` : label}
      onClick={right.toggle}
      isSelected={right.isOpen}
      className={right.isOpen ? styles.active : undefined}
      aria-pressed={right.isOpen}
      aria-busy={isRunning}
    >
      {isRunning ? <ThinkingPen size={32} /> : <AiLaunch size={20} />}
    </IconButton>
  );
}
