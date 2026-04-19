import { useState, useMemo, useCallback } from "react";
import { OverflowMenu, OverflowMenuItem } from "@carbon/react";
import { Chat as ChatIcon, Add } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ChatSession } from "@/core/types/chatbot.types";
import { formatRelativeTime } from "@/shared/utils/relativeTime";
import styles from "./ChatHistoryPanel.module.scss";

interface ChatHistoryPanelProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void | Promise<void>;
  onRenameSession: (id: string, name: string) => void | Promise<void>;
  onClose?: () => void;
  /** Show "新增對話" button at bottom */
  showNewChatButton?: boolean;
  onNewChat?: () => void | Promise<void>;
}

interface HistoryGroup {
  key: "today" | "yesterday" | "lastWeek" | "older";
  sessions: ChatSession[];
}

function groupSessions(sessions: ChatSession[]): HistoryGroup[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const weekStart = todayStart - 7 * 86_400_000;

  const groups: Record<string, ChatSession[]> = {
    today: [], yesterday: [], lastWeek: [], older: [],
  };

  for (const s of sessions) {
    const ts = s.updatedAt.getTime();
    if (ts >= todayStart) groups["today"].push(s);
    else if (ts >= yesterdayStart) groups["yesterday"].push(s);
    else if (ts >= weekStart) groups["lastWeek"].push(s);
    else groups["older"].push(s);
  }

  return Object.entries(groups)
    .filter(([, list]) => list.length > 0)
    .map(([key, list]) => ({ key: key as HistoryGroup["key"], sessions: list }));
}

export function ChatHistoryPanel({
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
  onRenameSession,
  onClose: _onClose,
  showNewChatButton = false,
  onNewChat,
}: ChatHistoryPanelProps) {
  const { t } = useTranslation("chatbot");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const groups = useMemo(() => groupSessions(sessions), [sessions]);

  const groupLabels = useMemo(() => ({
    today: t("ui.groupToday"),
    yesterday: t("ui.groupYesterday"),
    lastWeek: t("ui.groupLast7Days"),
    older: t("ui.groupOlder"),
  }), [t]);

  const startRename = useCallback((session: ChatSession) => {
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
      <div className={styles.list}>
        {groups.length === 0 && (
          <div className={styles.empty}>{t("ui.noHistory")}</div>
        )}

        {groups.map((group) => (
          <div key={group.key} className={styles.group}>
            <div className={styles.groupLabel}>{groupLabels[group.key]}</div>
            {group.sessions.map((session) => (
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
                <ChatIcon size={16} className={styles.itemIcon} />

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
                  <>
                    <span className={styles.itemName}>
                      {session.title || t("ui.defaultSessionTitle", { id: session.id.slice(0, 8) })}
                    </span>
                    <span className={styles.itemTime}>
                      {formatRelativeTime(session.updatedAt)}
                    </span>
                  </>
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
        ))}
      </div>

      {showNewChatButton && onNewChat && (
        <div className={styles.footer}>
          <button type="button" className={styles.newChatBtn} onClick={onNewChat}>
            <Add size={16} />
            <span>{t("ui.newChat")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
