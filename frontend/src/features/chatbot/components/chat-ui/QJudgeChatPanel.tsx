import { useMemo } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";

import { CopilotEmbedShell, CopilotFullPageShell } from "@copilot";
import { useWorkspace } from "@/features/app/contexts/WorkspaceContext";
import { useArtifactPanel } from "@/features/chatbot/contexts/ArtifactPanelContext";
import { ArtifactPanel } from "../artifact/ArtifactPanel";

import styles from "./ChatContainer.module.scss";
import { QJudgeChatPresentationContext } from "./qJudgeChatPresentationContext";
import { qJudgeCopilotSlots } from "./qJudgeCopilotSlots";

export interface QJudgeChatPanelProps {
  mode: "full" | "sidebar";
  onClose?: () => void;
  className?: string;
}

export function QJudgeChatPanel({
  mode,
  onClose,
  className,
}: QJudgeChatPanelProps) {
  const { isMobile } = useWorkspace();
  const { isOpen: artifactOpen } = useArtifactPanel();
  const showSplitPanel = artifactOpen && !isMobile;
  const showBottomSheet = artifactOpen && isMobile;
  const presentation = useMemo(() => ({ mode, onClose }), [mode, onClose]);

  const shell =
    mode === "full" ? (
      <CopilotFullPageShell
        history="hidden"
        slots={qJudgeCopilotSlots}
        className={styles.main}
      />
    ) : (
      <CopilotEmbedShell
        showHeader
        showHistory={false}
        slots={qJudgeCopilotSlots}
        className={styles.main}
      />
    );

  return (
    <QJudgeChatPresentationContext.Provider value={presentation}>
      <div className={`${styles.container} ${styles[mode]} ${className ?? ""}`}>
        {showSplitPanel ? (
          <Group orientation="horizontal" className={styles.splitPanels}>
            <Panel id="chat-panel" defaultSize={62} minSize="420px">
              {shell}
            </Panel>
            <Separator className={styles.resizeHandle} />
            <Panel id="artifact-panel" defaultSize={38} minSize="320px">
              <aside className={styles.artifactSplit}>
                <ArtifactPanel />
              </aside>
            </Panel>
          </Group>
        ) : (
          <div className={styles.chatOnlyRow}>{shell}</div>
        )}

        {showBottomSheet && (
          <div className={styles.bottomSheet} role="dialog">
            <ArtifactPanel />
          </div>
        )}
      </div>
    </QJudgeChatPresentationContext.Provider>
  );
}
