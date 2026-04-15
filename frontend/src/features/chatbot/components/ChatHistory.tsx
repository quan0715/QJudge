/**
 * ChatHistory — Carbon AI Chat history panel backed by QJudge API.
 *
 * Follows the official `chat-history-float` example from Carbon.
 * Uses @carbon/ai-chat-components history components.
 */
import { useState, useCallback, useEffect } from "react";
import {
  HistoryShell,
  HistoryHeader,
  HistoryToolbar,
  HistoryContent,
  HistoryPanel,
  HistoryPanelMenu,
  HistoryPanelItem,
  HistoryPanelItems,
  HistoryDeletePanel,
  HistoryLoading,
} from "@carbon/ai-chat-components/es/react/history";
import { type ChatInstance, PanelType, MessageResponseTypes, type HistoryItem } from "@carbon/ai-chat";
import { chatbotRepository } from "@/infrastructure/api/repositories";
import type { ChatSession } from "@/core/types/chatbot.types";

interface HistoryEntry {
  id: string;
  name: string;
  lastUpdated: string;
  selected: boolean;
  rename: boolean;
}

interface HistorySection {
  section: string;
  chats: HistoryEntry[];
}

function sessionToHistoryItems(session: ChatSession): HistoryItem[] {
  return session.messages.map((msg) => ({
    message:
      msg.role === "user"
        ? { input: { text: msg.content }, id: msg.id }
        : {
            id: msg.id,
            output: {
              generic: [{ response_type: MessageResponseTypes.TEXT, text: msg.content } as any],
            },
          },
    time: msg.timestamp.toISOString(),
  }));
}

function groupSessionsIntoSections(sessions: ChatSession[]): HistorySection[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - 7 * 86400000;

  const today: HistoryEntry[] = [];
  const yesterday: HistoryEntry[] = [];
  const week: HistoryEntry[] = [];
  const older: HistoryEntry[] = [];

  for (const s of sessions) {
    const ts = s.updatedAt.getTime();
    const entry: HistoryEntry = {
      id: s.id,
      name: s.title || `對話 ${s.id.slice(0, 8)}...`,
      lastUpdated: s.updatedAt.toISOString(),
      selected: false,
      rename: false,
    };
    if (ts >= todayStart) today.push(entry);
    else if (ts >= yesterdayStart) yesterday.push(entry);
    else if (ts >= weekStart) week.push(entry);
    else older.push(entry);
  }

  const sections: HistorySection[] = [];
  if (today.length) sections.push({ section: "今天", chats: today });
  if (yesterday.length) sections.push({ section: "昨天", chats: yesterday });
  if (week.length) sections.push({ section: "過去 7 天", chats: week });
  if (older.length) sections.push({ section: "更早", chats: older });
  return sections;
}

// ── Actions for overflow menu on each item ───────────────────────────────
const historyItemActions = [
  { text: "重新命名" },
  { text: "刪除", delete: true, divider: true },
];

interface ChatHistoryProps {
  instance: ChatInstance;
  currentSessionId: string | null;
  onSessionSelect: (sessionId: string) => void;
  onNewChat: () => void;
}

export function ChatHistory({ instance, currentSessionId, onSessionSelect, onNewChat }: ChatHistoryProps) {
  const [sections, setSections] = useState<HistorySection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeletePanel, setShowDeletePanel] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  // Load sessions from backend
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sessions = await chatbotRepository.getSessions();
        if (cancelled) return;
        setSections(groupSessionsIntoSections(sessions));
      } catch (err) {
        console.warn("Failed to load sessions:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Close history panel
  const handleClose = useCallback(() => {
    instance.customPanels?.getPanel(PanelType.HISTORY)?.close();
  }, [instance]);

  // Select a chat
  const handleSelectChat = useCallback(async (event: CustomEvent) => {
    const itemId = event.detail.itemId;
    if (itemId === currentSessionId) return;

    // Update selected state
    setSections(prev => prev.map(s => ({
      ...s,
      chats: s.chats.map(c => ({ ...c, selected: c.id === itemId })),
    })));

    // Load chat history into Carbon
    try {
      const full = await chatbotRepository.getSession(itemId);
      const items = sessionToHistoryItems(full);
      await instance.messaging.clearConversation();
      await instance.messaging.insertHistory(items);
      onSessionSelect(itemId);
    } catch (err) {
      console.warn("Failed to load chat:", err);
    }

    handleClose();
  }, [instance, currentSessionId, onSessionSelect, handleClose]);

  // New chat
  const handleNewChat = useCallback(async () => {
    try {
      await instance.messaging.restartConversation();
      onNewChat();
    } catch (err) {
      console.warn("Failed to create new chat:", err);
    }
    handleClose();
  }, [instance, onNewChat, handleClose]);

  // Overflow menu actions
  const handleItemAction = useCallback((event: any) => {
    const { action, itemId, element } = event.detail;
    switch (action) {
      case "刪除":
        setItemToDelete(itemId);
        setShowDeletePanel(true);
        break;
      case "重新命名":
        if (element) element.rename = true;
        break;
    }
  }, []);

  // Confirm delete
  const handleDeleteConfirm = useCallback(async () => {
    if (!itemToDelete) return;
    try {
      await chatbotRepository.deleteSession(itemToDelete);
      setSections(prev => prev.map(s => ({
        ...s,
        chats: s.chats.filter(c => c.id !== itemToDelete),
      })));
    } catch (err) {
      console.warn("Failed to delete session:", err);
    }
    setShowDeletePanel(false);
    setItemToDelete(null);
  }, [itemToDelete]);

  // Rename save
  const handleRenameSave = useCallback(async (event: CustomEvent) => {
    const { itemId, newName } = event.detail;
    if (!itemId || !newName) return;
    try {
      await chatbotRepository.renameSession(itemId, newName);
      setSections(prev => prev.map(s => ({
        ...s,
        chats: s.chats.map(c => c.id === itemId ? { ...c, name: newName } : c),
      })));
    } catch (err) {
      console.warn("Failed to rename session:", err);
    }
  }, []);

  return (
    <HistoryShell>
      <HistoryHeader
        headerTitle="對話紀錄"
        onClose={handleClose}
        showCloseAction
      />
      <HistoryToolbar onNewChatClick={handleNewChat} />
      <HistoryContent>
        {loading ? (
          <HistoryLoading />
        ) : (
          <HistoryPanel aria-label="對話紀錄">
            <HistoryPanelItems>
              {sections.length === 0 && (
                <div style={{ padding: "1rem", fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
                  尚無對話記錄
                </div>
              )}
              {sections.map((section) => (
                <HistoryPanelMenu key={section.section} expanded title={section.section}>
                  {section.chats.map((chat) => (
                    <HistoryPanelItem
                      key={chat.id}
                      id={chat.id}
                      name={chat.name}
                      selected={chat.id === currentSessionId}
                      rename={chat.rename}
                      actions={historyItemActions}
                      onMenuAction={handleItemAction}
                      onSelected={handleSelectChat}
                      onRenameSave={handleRenameSave}
                    />
                  ))}
                </HistoryPanelMenu>
              ))}
            </HistoryPanelItems>
          </HistoryPanel>
        )}
      </HistoryContent>
      {showDeletePanel && (
        <HistoryDeletePanel
          onCancel={() => { setShowDeletePanel(false); setItemToDelete(null); }}
          onConfirm={handleDeleteConfirm}
        >
          <div slot="title">確認刪除</div>
          <div slot="description">此對話將被永久刪除。</div>
        </HistoryDeletePanel>
      )}
    </HistoryShell>
  );
}
