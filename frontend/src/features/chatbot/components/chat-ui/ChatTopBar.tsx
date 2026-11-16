import { useState, useId, useCallback } from "react";
import {
  Dropdown,
  TextInput,
  IconButton,
  OverflowMenu,
  OverflowMenuItem,
  SkeletonText,
} from "@carbon/react";
import { Add, Close, RecentlyViewed } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { WorkspaceToolBar } from "@/features/app/components/WorkspaceToolBar";
import type { CopilotSessionSummary } from "@copilot";
import styles from "./ChatTopBar.module.scss";

interface ChatTopBarFullProps {
  mode: "full";
  /**
   * 當 chat 是嵌入式面板（右側 dock 或 bottom sheet）時傳 true，
   * 隱藏 WorkspaceToolBar 內建的展開/關閉 app sidebar 按鈕。
   */
  hideSidebarControl?: boolean;
  loading?: boolean;
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
  loading?: boolean;
  title?: string;
  historyOpen?: boolean;
  onToggleHistory?: () => void;
  onNewChat: () => void;
  onClose?: () => void;
}

type ChatTopBarProps = ChatTopBarFullProps | ChatTopBarSidebarProps;

export function ChatTopBar(props: ChatTopBarProps) {
  const { t } = useTranslation("chatbot");
  const id = useId();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const triggerNewChat = useCallback((onNewChat: () => void) => {
    setRenamingId(null);
    setRenameValue("");
    onNewChat();
  }, []);

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
    loading = false,
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
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      onRenameSession(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  };

  const titleSlot = loading ? (
    <div className={styles.titleArea} data-testid="chat-title-skeleton">
      <SkeletonText width="10rem" />
    </div>
  ) : (
    <div className={styles.titleArea}>
        {renamingId !== null && renamingId === currentSessionId ? (
          <TextInput
            id={`rename-session-${id}`}
            size="sm"
            labelText={t("ui.renameTask", "重新命名工作")}
            hideLabel
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
          <Dropdown
            id={`chat-session-${id}`}
            type="inline"
            titleText={t("ui.history")}
            hideLabel
            label={displayTitle}
            items={sessions.slice(0, 15)}
            selectedItem={sessions.find((session) => session.id === currentSessionId) ?? null}
            itemToString={(session) => session?.title || t("ui.newTask")}
            onChange={({ selectedItem }) => { if (selectedItem) onSelectSession(selectedItem.id); }}
            size="sm"
            className={styles.sessionSelect}
          />
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
          {!loading && currentSessionId && (
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
