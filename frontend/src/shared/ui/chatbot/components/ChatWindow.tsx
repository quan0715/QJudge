import type { FC } from "react";
import { useMemo, useState, useEffect } from "react";
import {
  IconButton,
  Dropdown,
  InlineNotification,
  Modal,
  TextInput,
  OverflowMenu,
  OverflowMenuItem,
} from "@carbon/react";
import { Edit, ChevronRight, Idea, DocumentAdd, CheckmarkOutline, Edit as EditIcon } from "@carbon/icons-react";
import type {
  ChatMessage,
  ChatModel,
  ChatSession,
  BackgroundInformation,
  UserInputRequest,
  ApprovalRequest,
} from "@/core/types/chatbot.types";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { UserInputModal } from "./UserInputModal";
import { WelcomeScreen } from "./WelcomeScreen";
import { AgentAvatar } from "./AgentAvatar";
import styles from "./ChatWindow.module.scss";

export interface ChatWindowProps {
  sessions: ChatSession[];
  currentSession: ChatSession | null;
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  onSend: (message: string, modelId?: ChatModel) => void;
  onStopStreaming?: () => void;
  pendingApproval?: ApprovalRequest | null;
  onConfirmAction?: () => void;
  onCancelAction?: () => void;
  onCreateSession: () => void;
  onSwitchSession: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => Promise<void>;
  onRenameSession?: (sessionId: string, title: string) => Promise<void>;
  onCollapse: () => void;
  onClearError?: () => void;
  problemContext?: {
    id: number | string;
    title: string;
  } | null;
  backgroundInfo?: BackgroundInformation | null;
  pendingUserInput?: UserInputRequest | null;
  onSubmitUserInput?: (
    requestId: string,
    answers: Record<string, string>
  ) => void;
  onCancelUserInput?: () => void;
}

/**
 * 聊天視窗元件
 * 包含 session 選擇、訊息列表、輸入區（含模型選擇）
 */
export const ChatWindow: FC<ChatWindowProps> = ({
  sessions,
  currentSession,
  isLoading,
  isStreaming,
  error,
  onSend,
  onStopStreaming,
  onCreateSession,
  onSwitchSession,
  onDeleteSession,
  onRenameSession,
  onCollapse,
  onClearError,
  problemContext = null,
  backgroundInfo = null,
  pendingUserInput = null,
  onSubmitUserInput,
  onCancelUserInput,
  pendingApproval = null,
  onConfirmAction,
  onCancelAction,
}) => {
  const messages: ChatMessage[] = currentSession?.messages ?? [];
  const isUninitializedTempSession = Boolean(
    currentSession &&
      currentSession.id.startsWith("temp-") &&
      !currentSession.metadata?.backend_session_id
  );
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameInputValue, setRenameInputValue] = useState(currentSession?.title || "");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // 當 currentSession 改變時，更新 renameInputValue
  useEffect(() => {
    setRenameInputValue(currentSession?.title || "");
  }, [currentSession?.id]);

  // 建議的 prompts（針對題目編輯情境）
  const suggestedPrompts = useMemo(() => {
    const prompts = [];

    if (problemContext) {
      prompts.push(
        {
          icon: Idea,
          text: "幫我設計這題的測試案例",
          onClick: () => onSend("請幫我設計這題的測試案例，包含邊界條件和特殊情況。"),
        },
        {
          icon: DocumentAdd,
          text: "生成題目描述範例",
          onClick: () => onSend("請幫我生成這題的題目描述範例，讓學生更容易理解。"),
        },
        {
          icon: CheckmarkOutline,
          text: "檢查題目完整性",
          onClick: () => onSend("請檢查這題的完整性，包含題目描述、測試案例、限制條件等。"),
        },
        {
          icon: EditIcon,
          text: "優化題目難度設定",
          onClick: () => onSend("請評估並建議這題的難度設定是否合適。"),
        }
      );
    } else {
      prompts.push(
        {
          icon: Idea,
          text: "如何設計一個好的題目？",
          onClick: () => onSend("請教我如何設計一個好的程式題目？"),
        },
        {
          icon: DocumentAdd,
          text: "測試案例設計技巧",
          onClick: () => onSend("請分享測試案例設計的技巧和最佳實踐。"),
        }
      );
    }

    return prompts;
  }, [problemContext, onSend]);

  // 歡迎畫面
  const welcomeScreen = useMemo(() => {
    return (
      <WelcomeScreen
        title="我能為您做什麼？"
        subtitle={problemContext ? `正在協助您編輯：${problemContext.title}` : undefined}
        suggestedPrompts={suggestedPrompts}
      />
    );
  }, [problemContext, suggestedPrompts]);

  return (
    <div className={styles.chatWindow}>
      {/* 標題列 - 整合 Session 選擇器 */}
      <div className={styles.chatHeader}>
        {/* 左側：Session 下拉選擇器 */}
        <div
          className={`${styles.chatTitleContainer} ${
            isUninitializedTempSession ? styles.chatTitleContainerNoAvatar : ""
          }`}
        >
          {!isUninitializedTempSession && (
            <AgentAvatar size="sm" className={styles.chatIcon} />
          )}
          <Dropdown
            id="session-selector"
            titleText=""
            label={currentSession?.title || "新對話"}
            items={sessions.map((s) => s.id)}
            itemToString={(itemId) =>
              sessions.find((s) => s.id === itemId)?.title || ""
            }
            selectedItem={currentSession?.id}
            onChange={({ selectedItem }) => {
              if (selectedItem) {
                onSwitchSession(selectedItem);
              }
            }}
            size="sm"
            className={styles.sessionDropdown}
          />
        </div>

        {/* 右側：操作按鈕 */}
        <div className={styles.headerActions}>
          {currentSession && (
            <OverflowMenu key={`overflow-${currentSession.id}`} flipped>
              <OverflowMenuItem
                itemText="重命名"
                onClick={() => {
                  setRenameInputValue(currentSession.title);
                  setIsRenameModalOpen(true);
                }}
              />
              <OverflowMenuItem
                isDelete
                itemText="刪除"
                onClick={() => {
                  setIsDeleteConfirmOpen(true);
                }}
              />
            </OverflowMenu>
          )}
          <IconButton
            label="新增對話"
            kind="ghost"
            size="sm"
            onClick={onCreateSession}
            align="left"
          >
            <Edit size={16} />
          </IconButton>
          <IconButton
            label="收合面板"
            kind="ghost"
            size="sm"
            onClick={onCollapse}
            align="left"
          >
            <ChevronRight size={16} />
          </IconButton>
        </div>
      </div>

      {/* 錯誤訊息 */}
      {error && (
        <div className={styles.errorContainer}>
          <InlineNotification
            kind="error"
            title="錯誤"
            subtitle={error}
            lowContrast
            hideCloseButton={!onClearError}
            onClose={onClearError}
          />
        </div>
      )}

      {/* 訊息區 */}
      <MessageList
        messages={messages}
        isLoading={isLoading}
        isStreaming={isStreaming}
        welcomeScreen={welcomeScreen}
      />

      {/* Approval Banner */}
      {pendingApproval && onConfirmAction && onCancelAction && (
        <div className={styles.approvalBanner}>
          <InlineNotification
            kind="warning"
            title={pendingApproval.actionType === "create" ? "建立題目確認" : "修改題目確認"}
            subtitle="Agent 已準備好執行操作，請確認或取消。"
            lowContrast
            hideCloseButton
          />
          <div className={styles.approvalActions}>
            <button
              className={styles.approvalConfirmBtn}
              onClick={onConfirmAction}
            >
              確認執行
            </button>
            <button
              className={styles.approvalCancelBtn}
              onClick={onCancelAction}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 輸入區 */}
      <ChatInput
        onSend={onSend}
        onStop={onStopStreaming}
        disabled={isLoading || !!pendingApproval}
        isStreaming={isStreaming}
        problemContext={problemContext}
        backgroundInfo={backgroundInfo}
        hasMessages={messages.length > 0}
      />

      {/* User Input Modal - AI 詢問用戶問題 */}
      {pendingUserInput && onSubmitUserInput && onCancelUserInput && (
        <UserInputModal
          isOpen={!!pendingUserInput}
          requestId={pendingUserInput.requestId}
          questions={pendingUserInput.questions}
          onSubmit={onSubmitUserInput}
          onCancel={onCancelUserInput}
        />
      )}

      {/* Rename Session Modal */}
      {currentSession && (
        <Modal
          open={isRenameModalOpen}
          modalHeading="重命名對話"
          primaryButtonText="儲存"
          secondaryButtonText="取消"
          onRequestClose={() => setIsRenameModalOpen(false)}
          onRequestSubmit={async () => {
            if (
              onRenameSession &&
              renameInputValue.trim() &&
              renameInputValue !== currentSession.title
            ) {
              try {
                await onRenameSession(currentSession.id, renameInputValue.trim());
                setIsRenameModalOpen(false);
              } catch (err) {
                console.error("Failed to rename session:", err);
              }
            } else {
              setIsRenameModalOpen(false);
            }
          }}
          size="sm"
        >
          <div style={{ paddingBottom: "1rem" }}>
            <TextInput
              id="rename-input"
              labelText="新名稱"
              value={renameInputValue}
              onChange={(e) => setRenameInputValue(e.target.value)}
              placeholder="輸入新的對話名稱"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const submitBtn = e.currentTarget
                    .closest(".cds--modal")
                    ?.querySelector(
                      ".cds--btn--primary"
                    ) as HTMLButtonElement;
                  submitBtn?.click();
                }
              }}
              autoFocus
            />
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {currentSession && (
        <Modal
          open={isDeleteConfirmOpen}
          modalHeading="確認刪除"
          primaryButtonText={isDeleting ? "刪除中..." : "刪除"}
          primaryButtonDisabled={isDeleting}
          secondaryButtonText="取消"
          danger
          onRequestClose={() => !isDeleting && setIsDeleteConfirmOpen(false)}
          onRequestSubmit={async () => {
            if (onDeleteSession) {
              setIsDeleting(true);
              try {
                await onDeleteSession(currentSession.id);
                setIsDeleteConfirmOpen(false);
              } catch (err) {
                console.error("Failed to delete session:", err);
              } finally {
                setIsDeleting(false);
              }
            }
          }}
          size="sm"
        >
          <p>
            確定要刪除對話「<strong>{currentSession.title}</strong>」嗎？
            <br />
            此操作無法復原。
          </p>
        </Modal>
      )}
    </div>
  );
};

export default ChatWindow;
