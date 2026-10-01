import { IconButton } from "@carbon/react";
import { AiLaunch } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "@/features/app/contexts/WorkspaceContext";

/** Opens and closes the AI assistant panel from the top navigation. */
export function AiAssistantNavButton() {
  const { t } = useTranslation("common");
  const { right } = useWorkspace();
  if (!right.isAllowed || right.isDisabled) return null;

  return (
    <IconButton
      kind="ghost"
      size="md"
      align="bottom"
      label={t("workspaceTopNav.aiAssistant", "AI 助教")}
      onClick={right.toggle}
      isSelected={right.isOpen}
      aria-pressed={right.isOpen}
    >
      <AiLaunch size={20} />
    </IconButton>
  );
}
