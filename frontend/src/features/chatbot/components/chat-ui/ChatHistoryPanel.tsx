import { useState, useMemo, useCallback } from "react";
import { Search, OverflowMenu, OverflowMenuItem } from "@carbon/react";
import type { ChatSession } from "@/core/types/chatbot.types";
import styles from "./ChatHistoryPanel.module.scss";

interface ChatHistoryPanelProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, name: string) => void;
}

interface HistoryGroup {
  label: string;
  sessions: ChatSession[];
}

function groupSessions(sessions: ChatSession[]): HistoryGroup[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const weekStart = todayStart - 7 * 86_400_000;

  const groups: Record<string, ChatSession[]> = {
    "今天": [],
    "昨天": [],
    "過去 7 天": [],
    "更早": [],
  };

  for (const s of sessions) {
    const ts = s.updatedAt.getTime();
    if (ts >= todayStart) groups["今天"].push(s);
    else if (ts >= yesterdayStart) groups["昨天"].push(s);
    else if (ts >= weekStart) groups["過去 7 天"].push(s);
    else groups["更早"].push(s);
  }

  return Object.entries(groups)
    .filter(([, list]) => list.length > 0)
    .map(([label, list]) => ({ label, sessions: list }));
}

export function ChatHistoryPanel({
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
  onRenameSession,
}: ChatHistoryPanelProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.trim().toLowerCase();
    return sessions.filter((s) => s.title?.toLowerCase().includes(q));
  }, [sessions, searchQuery]);

  const groups = useMemo(() => groupSessions(filteredSessions), [filteredSessions]);

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
          placeholder="搜尋對話…"
          labelText="搜尋對話"
          value={searchQuery}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
          closeButtonLabelText="清除"
        />
      </div>

      <div className={styles.list}>
        {groups.length === 0 && (
          <div className={styles.empty}>尚無對話記錄</div>
        )}

        {groups.map((group) => (
          <div key={group.label} className={styles.group}>
            <div className={styles.groupLabel}>{group.label}</div>
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
                  if (e.key === "Enter") onSelectSession(session.id);
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
                    {session.title || `對話 ${session.id.slice(0, 8)}…`}
                  </span>
                )}

                <OverflowMenu
                  size="sm"
                  flipped
                  className={styles.overflow}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                >
                  <OverflowMenuItem
                    itemText="重新命名"
                    onClick={() => startRename(session)}
                  />
                  <OverflowMenuItem
                    itemText="刪除"
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
