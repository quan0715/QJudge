import { IconButton } from "@carbon/react";
import { AiLaunch } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "@/features/app/contexts/WorkspaceContext";
import styles from "./AiAssistantNavButton.module.scss";

/** Opens and closes the AI assistant panel from the top navigation. */
export function AiAssistantNavButton() {
  const { t } = useTranslation("common");
  const { right } = useWorkspace();
  if (!right.isAllowed || right.isDisabled) return null;

  return (
    <IconButton
      kind="ghost"
      size="lg"
      align="bottom"
      label={t("workspaceTopNav.aiAssistant", "AI 助教")}
      onClick={right.toggle}
      isSelected={right.isOpen}
      className={right.isOpen ? styles.active : undefined}
      aria-pressed={right.isOpen}
    >
      <AiLaunch size={20} />
    </IconButton>
  );
}
