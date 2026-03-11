import type { FC } from "react";
import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  IconButton,  Dropdown,
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
  const { t } = useTranslation("chatbot");
  const { t: tc } = useTranslation("common");
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
          text: t("prompts.designTestCases"),
          onClick: () => onSend(t("prompts.designTestCasesPrompt")),
        },
        {
          icon: DocumentAdd,
          text: t("prompts.generateDescription"),
          onClick: () => onSend(t("prompts.generateDescriptionPrompt")),
        },
        {
          icon: CheckmarkOutline,
          text: t("prompts.checkCompleteness"),
          onClick: () => onSend(t("prompts.checkCompletenessPrompt")),
        },
        {
          icon: EditIcon,
          text: t("prompts.optimizeDifficulty"),
          onClick: () => onSend(t("prompts.optimizeDifficultyPrompt")),
        }
      );
    } else {
      prompts.push(
        {
          icon: Idea,
          text: t("prompts.howToDesign"),
          onClick: () => onSend(t("prompts.howToDesignPrompt")),
        },
        {
          icon: DocumentAdd,
          text: t("prompts.testCaseSkills"),
          onClick: () => onSend(t("prompts.testCaseSkillsPrompt")),
        }
      );
    }

    return prompts;
  }, [problemContext, onSend, t]);

  // 歡迎畫面
  const welcomeScreen = useMemo(() => {
    return (
      <WelcomeScreen
        title={t("welcome.title")}
        subtitle={problemContext ? t("welcome.subtitle", { title: problemContext.title }) : undefined}
        suggestedPrompts={suggestedPrompts}
      />
    );
  }, [problemContext, suggestedPrompts, t]);

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
            label={currentSession?.title || t("widget.newChatLabel")}
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
                itemText={t("widget.rename")}
                onClick={() => {
                  setRenameInputValue(currentSession.title);
                  setIsRenameModalOpen(true);
                }}
              />
              <OverflowMenuItem
                isDelete
                itemText={t("widget.delete")}
                onClick={() => {
                  setIsDeleteConfirmOpen(true);
                }}
              />
            </OverflowMenu>
          )}
          <IconButton
            label={t("widget.addChat")}
            kind="ghost"
            size="sm"
            onClick={onCreateSession}
            align="left"
          >
            <Edit size={16} />
          </IconButton>
          <IconButton
            label={t("widget.collapse")}
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
            title={tc("error.title")}
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
            title={t("approval.title")}
            subtitle="Agent 已準備好執行操作，請確認或取消。"
            lowContrast
            hideCloseButton
          />
          <div className={styles.approvalActions}>
            <button
              className={styles.approvalConfirmBtn}
              onClick={onConfirmAction}
            >
              {t("approval.confirm")}
            </button>
            <button
              className={styles.approvalCancelBtn}
              onClick={onCancelAction}
            >
              {t("approval.cancel")}
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
          modalHeading={t("widget.renameModal.title")}
          primaryButtonText={t("widget.renameModal.submit")}
          secondaryButtonText={t("widget.renameModal.cancel")}
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
              labelText={t("widget.renameModal.label")}
              value={renameInputValue}
              onChange={(e) => setRenameInputValue(e.target.value)}
              placeholder={t("widget.renameModal.placeholder")}
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
          modalHeading={t("widget.deleteModal.title")}
          primaryButtonText={isDeleting ? t("widget.deleteModal.submitting") : t("widget.deleteModal.submit")}
          primaryButtonDisabled={isDeleting}
          secondaryButtonText={t("widget.deleteModal.cancel")}
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
            {t("widget.deleteModal.confirmMessage", { title: currentSession.title })}
            <br />
            {t("widget.deleteModal.undoWarning")}
          </p>
        </Modal>
      )}
    </div>
  );
};

export default ChatWindow;
