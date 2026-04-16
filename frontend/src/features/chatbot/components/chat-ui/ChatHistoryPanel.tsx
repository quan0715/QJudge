import { useState, useMemo, useCallback } from "react";
import { Search, IconButton, OverflowMenu, OverflowMenuItem } from "@carbon/react";
import { Close } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ChatSession } from "@/core/types/chatbot.types";
import styles from "./ChatHistoryPanel.module.scss";

interface ChatHistoryPanelProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, name: string) => void;
  onClose?: () => void;
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
    today: [],
    yesterday: [],
    lastWeek: [],
    older: [],
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
  onClose,
}: ChatHistoryPanelProps) {
  const { t } = useTranslation("chatbot");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.trim().toLowerCase();
    return sessions.filter((s) => (s.title ?? "").toLowerCase().includes(q));
  }, [sessions, searchQuery]);

  const groups = useMemo(() => groupSessions(filteredSessions), [filteredSessions]);

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
      <div className={styles.header}>
        <Search
          size="sm"
          placeholder={t("ui.searchPlaceholder")}
          labelText={t("ui.searchLabel")}
          value={searchQuery}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
          closeButtonLabelText={t("ui.clear")}
          className={styles.search}
        />
        {onClose && (
          <IconButton kind="ghost" size="sm" label={t("ui.close")} onClick={onClose} className={styles.closeBtn}>
            <Close size={20} />
          </IconButton>
        )}
      </div>

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
                className={`${styles.item} ${
                  session.id === currentSessionId ? styles.active : ""
                }`}
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
                    {session.title || t("ui.defaultSessionTitle", { id: session.id.slice(0, 8) })}
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
        ))}
      </div>
    </div>
  );
}
