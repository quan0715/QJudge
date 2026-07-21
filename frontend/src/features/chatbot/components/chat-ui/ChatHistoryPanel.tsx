import { useState, useMemo, useCallback } from "react";
import { OverflowMenu, OverflowMenuItem } from "@carbon/react";
import { Add } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { CopilotSessionSummary } from "@copilot";
import styles from "./ChatHistoryPanel.module.scss";

interface ChatHistoryPanelProps {
  sessions: readonly CopilotSessionSummary[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void | Promise<void>;
  onRenameSession: (id: string, name: string) => void | Promise<void>;
  onNewTask?: () => void | Promise<void>;
}

export function ChatHistoryPanel({
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
  onRenameSession,
  onNewTask,
}: ChatHistoryPanelProps) {
  const { t } = useTranslation("chatbot");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const orderedSessions = useMemo(
    () => [...sessions].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()),
    [sessions],
  );

  const startRename = useCallback((session: CopilotSessionSummary) => {
    setRenamingId(session.id);
    setRenameValue(session.title || "");
  }, []);

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      onRenameSession(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  }, [renamingId, renameValue, onRenameSession]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        {onNewTask && (
          <button type="button" className={styles.newTaskAction} onClick={onNewTask}>
            <Add size={16} />
            <span>{t("ui.newTask")}</span>
          </button>
        )}
        <h2 className={styles.heading}>{t("ui.tasks")}</h2>
      </div>

      <div className={styles.list}>
        {orderedSessions.length === 0 && (
          <div className={styles.empty}>{t("ui.noTasks")}</div>
        )}

        {orderedSessions.map((session) => (
          <div
            key={session.id}
            className={`${styles.item} ${session.id === currentSessionId ? styles.active : ""}`}
            onClick={() => onSelectSession(session.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectSession(session.id);
              }
            }}
          >
            {renamingId === session.id ? (
              <input
                className={styles.renameInput}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") {
                    setRenamingId(null);
                    setRenameValue("");
                  }
                }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className={styles.itemName}>
                {session.title || t("ui.defaultTaskTitle", { id: session.id.slice(0, 8) })}
              </span>
            )}

            <OverflowMenu
              size="sm"
              flipped
              className={styles.overflow}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <OverflowMenuItem
                itemText={t("ui.rename")}
                onClick={() => startRename(session)}
              />
              <OverflowMenuItem
                itemText={t("ui.delete")}
                isDelete
                hasDivider
                onClick={() => onDeleteSession(session.id)}
              />
            </OverflowMenu>
          </div>
        ))}
      </div>
    </div>
  );
}
