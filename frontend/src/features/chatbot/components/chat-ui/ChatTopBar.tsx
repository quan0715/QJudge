import { useState, useRef, useEffect, useCallback } from "react";
import { IconButton, OverflowMenu, OverflowMenuItem } from "@carbon/react";
import { Add, Close, ChevronDown, Chat as ChatIcon, RecentlyViewed } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { WorkspaceToolBar } from "@/features/app/components/WorkspaceToolBar";
import type { CopilotSessionSummary } from "@copilot";
import { formatRelativeTime } from "@/shared/utils/relativeTime";
import styles from "./ChatTopBar.module.scss";

interface ChatTopBarFullProps {
  mode: "full";
  /**
   * 當 chat 是嵌入式面板（右側 dock 或 bottom sheet）時傳 true，
   * 隱藏 WorkspaceToolBar 內建的展開/關閉 app sidebar 按鈕。
   */
  hideSidebarControl?: boolean;
  title?: string;
  sessions: readonly CopilotSessionSummary[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onRenameSession: (id: string, title: string) => void;
  onDeleteSession: (id: string) => void;
  onClose?: () => void;
}

interface ChatTopBarSidebarProps {
  mode?: "sidebar";
  title?: string;
  historyOpen?: boolean;
  onToggleHistory?: () => void;
  onNewChat: () => void;
  onClose?: () => void;
}

type ChatTopBarProps = ChatTopBarFullProps | ChatTopBarSidebarProps;

export function ChatTopBar(props: ChatTopBarProps) {
  const { t } = useTranslation("chatbot");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const closeDropdown = useCallback(() => setDropdownOpen(false), []);
  const triggerNewChat = useCallback((onNewChat: () => void) => {
    setDropdownOpen(false);
    setRenamingId(null);
    setRenameValue("");
    onNewChat();
  }, []);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen, closeDropdown]);

  // ── Sidebar mode ──
  if (!props.mode || props.mode === "sidebar") {
    const { title, historyOpen = false, onToggleHistory, onNewChat, onClose } = props as ChatTopBarSidebarProps;
    const displayTitle = title || t("ui.chatbotTitle");
    return (
      <WorkspaceToolBar
        hideSidebarControl
        leadingBefore={
          onToggleHistory ? (
            <IconButton
              kind="ghost"
              size="md"
              align="bottom"
              label={historyOpen ? t("ui.collapse") : t("ui.history")}
              onClick={onToggleHistory}
            >
              {historyOpen ? <Close size={20} /> : <RecentlyViewed size={20} />}
            </IconButton>
          ) : undefined
        }
        title={<span className={styles.sidebarTitle}>{displayTitle}</span>}
        actions={
          <>
            <IconButton
              kind="ghost"
              size="md"
              align="bottom"
              label={t("ui.addComment")}
              onClick={() => triggerNewChat(onNewChat)}
            >
              <Add size={20} />
            </IconButton>
            {onClose && (
              <IconButton kind="ghost" size="md" align="bottom" label={t("ui.close")} onClick={onClose}>
                <Close size={20} />
              </IconButton>
            )}
          </>
        }
      />
    );
  }

  // ── Full-page mode ──
  const {
    title,
    hideSidebarControl = false,
    sessions,
    currentSessionId,
    onSelectSession,
    onNewChat,
    onRenameSession,
    onDeleteSession,
    onClose,
  } = props as ChatTopBarFullProps;
  const displayTitle = title || t("ui.newTask");

  const startRename = (session: CopilotSessionSummary) => {
    setRenamingId(session.id);
    setRenameValue(session.title || "");
    setDropdownOpen(false);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      onRenameSession(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  };

  const titleSlot = (
    <div className={styles.titleArea} ref={dropdownRef}>
        {renamingId === currentSessionId ? (
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
          />
        ) : (
          <button
            type="button"
            className={styles.titleBtn}
            onClick={() => setDropdownOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={dropdownOpen}
          >
            <span className={styles.titleText}>{displayTitle}</span>
            <ChevronDown
              size={16}
              className={`${styles.titleChevron} ${dropdownOpen ? styles.open : ""}`}
            />
          </button>
        )}

        {dropdownOpen && (
          <div className={styles.dropdown} role="listbox">
            {sessions.slice(0, 15).map((s) => (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={s.id === currentSessionId}
                className={`${styles.dropdownItem} ${s.id === currentSessionId ? styles.dropdownItemActive : ""}`}
                onClick={() => {
                  onSelectSession(s.id);
                  setDropdownOpen(false);
                }}
              >
                <ChatIcon size={14} className={styles.dropdownItemIcon} />
                <span className={styles.dropdownItemTitle}>
                  {s.title || t("ui.newTask")}
                </span>
                <span className={styles.dropdownItemTime}>
                  {formatRelativeTime(s.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        )}
    </div>
  );

  return (
    <WorkspaceToolBar
      hideSidebarControl={hideSidebarControl}
      title={titleSlot}
      actions={
        <>
          <IconButton
            kind="ghost"
            size="md"
            align="bottom"
            label={t("ui.addComment")}
            onClick={() => triggerNewChat(onNewChat)}
          >
            <Add size={20} />
          </IconButton>
          {currentSessionId && (
            <OverflowMenu flipped size="md" align="bottom" iconDescription={t("ui.moreOptions")}>
              <OverflowMenuItem
                itemText={t("ui.rename")}
                onClick={() => {
                  const session = sessions.find((s) => s.id === currentSessionId);
                  if (session) startRename(session);
                }}
              />
              <OverflowMenuItem
                itemText={t("ui.delete")}
                isDelete
                hasDivider
                onClick={() => onDeleteSession(currentSessionId)}
              />
            </OverflowMenu>
          )}
          {onClose && (
            <IconButton kind="ghost" size="md" align="bottom" label={t("ui.close")} onClick={onClose}>
              <Close size={20} />
            </IconButton>
          )}
        </>
      }
    />
  );
}
