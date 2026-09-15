import { useState } from "react";
import {
  Modal,
  TextArea,
  Checkbox,
  Select,
  SelectItem,
  TextInput,
  Button,
  Tag,
  InlineNotification,
  SkeletonText,
} from "@carbon/react";
import type {
  Clarification,
  ContestProblemSummary,
} from "@/core/entities/contest.entity";
import {
  createClarification,
  createContestAnnouncement,
  replyClarification,
  deleteClarification,
  deleteContestAnnouncement,
} from "@/infrastructure/api/repositories";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import { useClarifications } from "@/features/contest/hooks/useClarifications";
import { useAuth } from "@/features/auth/contexts/AuthContext";

import { Add, TrashCan, Reply } from "@carbon/icons-react";
import { BlockHeader } from "@/shared/components/dashboard";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import { formatDate } from "@/shared/utils/format";
import styles from "./ContestClarifications.module.scss";

interface ContestClarificationsBaseProps {
  contestId: string;
  problems?: ContestProblemSummary[];
  contestStatus?: string;
  contestEndTime?: string;
  embedded?: boolean;
  rules?: string;
}

/**
 * - `participate`: taking the exam — read announcements, ask questions and
 *   delete your own. Staff sitting the exam get exactly this view.
 * - `manage`: the admin panel — reply to and delete any question, delete
 *   announcements; the panel's own action opens the announcement dialog.
 */
type ContestClarificationsProps = ContestClarificationsBaseProps &
  (
    | { mode: "participate" }
    | {
        mode: "manage";
        announcementOpen: boolean;
        onAnnouncementOpenChange: (open: boolean) => void;
      }
  );

const ContestClarifications: React.FC<ContestClarificationsProps> = (props) => {
  const {
    contestId,
    mode,
    problems = [],
    contestStatus = "published",
    contestEndTime,
    embedded = false,
    rules,
  } = props;
  const isManaging = mode === "manage";
  const { user } = useAuth();
  const {
    clarifications,
    announcements,
    loading,
    error,
    refresh: refreshData,
  } = useClarifications(contestId);

  const [saving, setSaving] = useState(false);
  const filteredQuestions = clarifications;
  const isEnded = !!contestEndTime && new Date(contestEndTime) < new Date();
  const isReadOnly = contestStatus !== "published" || isEnded;

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [replyModalOpen, setReplyModalOpen] = useState(false);
  const announcementModalOpen = props.mode === "manage" && props.announcementOpen;
  const setAnnouncementModalOpen = (open: boolean) => {
    if (props.mode === "manage") props.onAnnouncementOpenChange(open);
  };

  const [selectedClar, setSelectedClar] = useState<Clarification | null>(null);

  // Create Clarification state
  const [newContent, setNewContent] = useState("");
  const [newProblemId, setNewProblemId] = useState("");

  // Reply state
  const [replyText, setReplyText] = useState("");
  const [replyIsPublic, setReplyIsPublic] = useState(false);

  // Announcement state
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementContent, setAnnouncementContent] = useState("");

  // Error Modal State
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const { confirm, modalProps } = useConfirmModal();

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setErrorModalOpen(true);
  };

  const handleCreateClarification = async () => {
    if (!newContent.trim() || saving) return;

    setSaving(true);
    try {
      await createClarification(contestId, {
        question: newContent,
        problem_id: newProblemId || undefined,
      });
      setModalOpen(false);
      setNewContent("");
      setNewProblemId("");
      refreshData();
    } catch (error) {
      console.error("Failed to create clarification", error);
      showError("發布失敗，請檢查輸入內容");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAnnouncement = async () => {
    if (!announcementTitle.trim() || !announcementContent.trim() || saving) return;

    setSaving(true);
    try {
      await createContestAnnouncement(contestId, {
        title: announcementTitle,
        content: announcementContent,
      });
      setAnnouncementModalOpen(false);
      setAnnouncementTitle("");
      setAnnouncementContent("");
      refreshData();
    } catch (error) {
      console.error("Failed to create announcement", error);
      showError("發布公告失敗");
    } finally {
      setSaving(false);
    }
  };

  const handleReply = async () => {
    if (!selectedClar || !replyText.trim() || saving) return;

    setSaving(true);
    try {
      await replyClarification(
        contestId,
        selectedClar.id,
        replyText,
        replyIsPublic
      );
      setReplyModalOpen(false);
      setReplyText("");
      setReplyIsPublic(false);
      setSelectedClar(null);
      refreshData();
    } catch (error) {
      console.error("Failed to reply to clarification", error);
      showError("回覆失敗，請稍後重試");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClarification = async (clarId: string) => {
    const confirmed = await confirm({
      title: "確定要刪除此提問？",
      confirmLabel: "刪除",
      cancelLabel: "取消",
      danger: true,
    });
    if (!confirmed) return;

    try {
      await deleteClarification(contestId, clarId);
      refreshData();
    } catch (error) {
      console.error("Failed to delete clarification", error);
      showError("刪除提問失敗");
    }
  };

  const handleDeleteAnnouncement = async (annId: string) => {
    const confirmed = await confirm({
      title: "確定要刪除此公告？",
      confirmLabel: "刪除",
      cancelLabel: "取消",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await deleteContestAnnouncement(contestId, annId);
      refreshData();
    } catch (error) {
      console.error("Failed to delete announcement", error);
      showError("刪除公告失敗");
    }
  };

  const openReplyModal = (clar: Clarification) => {
    setSelectedClar(clar);
    setReplyText(clar.answer || "");
    setReplyIsPublic(clar.isPublic);
    setReplyModalOpen(true);
  };

  if (loading) return <SkeletonText paragraph lineCount={4} />;

  return (
    <div className={`${styles.root} ${embedded ? styles.embedded : ""}`}>
      {!embedded ? <BlockHeader
        title="公告與提問"
        description={isManaging ? "發布考試消息，集中回覆考生的問題。" : "查看考試消息，向教師詢問題目或考試相關問題。"}
      /> : null}
      {error ? <InlineNotification kind="error" lowContrast hideCloseButton title="公告與提問載入失敗" subtitle="請重新整理後再試。" /> : null}
      {isReadOnly && rules === undefined ? <p className={styles.notice}>{isEnded ? "考試已結束，公告與提問可供查閱，不再開放新增。" : "考試尚未發布，目前不開放新增公告或提問。"}</p> : null}
      <section className={styles.section} aria-label="公告">
        <BlockHeader title="公告" titleAs="h3" actions={
          <div className={styles.actions}>
            <Tag size="sm" type="cool-gray">{announcements.length} 則</Tag>
          </div>
        } />
        {announcements.length ? <div className={styles.list}>
          {announcements.map((ann) => <article className={styles.announcement} key={ann.id}>
            <BlockHeader title={ann.title} titleAs="h4" actions={isManaging ?
              <Button kind="ghost" size="sm" hasIconOnly renderIcon={TrashCan} iconDescription={`刪除公告：${ann.title}`} onClick={() => void handleDeleteAnnouncement(ann.id)} /> : undefined} />
            <p className={styles.meta}>{ann.createdBy || "教師"} · {formatDate(ann.createdAt, { includeSeconds: false })}</p>
            <MarkdownRenderer>{ann.content}</MarkdownRenderer>
          </article>)}
        </div> : <p className={styles.empty}>目前沒有公告，最新考試消息會顯示在這裡。</p>}
      </section>
      <section className={styles.section} aria-label="提問與回覆">
        <BlockHeader title="提問與回覆" titleAs="h3" actions={
          !isReadOnly && !isManaging ? <Button kind="tertiary" size="sm" renderIcon={Add} onClick={() => setModalOpen(true)}>提出問題</Button> : undefined
        } />
        <div className={styles.list}>
          {filteredQuestions.map((clar) => <article className={styles.question} key={clar.id}>
            <div className={styles.questionHeader}>
              <div className={styles.meta}>{clar.authorUsername} · {formatDate(clar.createdAt, { includeSeconds: false })}</div>
              <div className={styles.actions}>
                <Tag size="sm" type={clar.answer ? "green" : "warm-gray"}>{clar.answer ? "已回覆" : "待回覆"}</Tag>
                {!clar.isPublic ? <Tag size="sm" type="cool-gray">私人</Tag> : null}
              </div>
            </div>
            {clar.problemTitle ? <p className={styles.meta}>相關題目 · {clar.problemTitle}</p> : null}
            <MarkdownRenderer>{clar.question}</MarkdownRenderer>
            {clar.answer ? <div className={styles.answer}>
              <p className={styles.answerLabel}>{clar.answeredBy || "教師"} 回覆</p>
              <MarkdownRenderer>{clar.answer}</MarkdownRenderer>
            </div> : null}
            {isManaging || (user && clar.authorId === String(user.id)) ? <div className={styles.actions}>
              {isManaging ? <Button kind="ghost" size="sm" renderIcon={Reply} onClick={() => openReplyModal(clar)}>{clar.answer ? "編輯回覆" : "回覆提問"}</Button> : null}
              <Button kind="danger--ghost" size="sm" renderIcon={TrashCan} onClick={() => void handleDeleteClarification(clar.id)}>刪除提問</Button>
            </div> : null}
          </article>)}
          {!filteredQuestions.length ? <p className={styles.empty}>目前沒有提問。問題與教師回覆會集中顯示在這裡。</p> : null}
        </div>
      </section>

      {rules !== undefined ? (
        <section className={styles.section} aria-label="規則說明">
          <BlockHeader title="規則說明" titleAs="h3" />
          {rules.trim() ? <MarkdownRenderer>{rules}</MarkdownRenderer> : null}
        </section>
      ) : null}

      {/* Create Clarification Modal */}
      <Modal
        open={modalOpen}
        modalHeading="提出問題"
        primaryButtonText="送出"
        secondaryButtonText="取消"
        onRequestClose={() => setModalOpen(false)}
        primaryButtonDisabled={saving || !newContent.trim()}
        onRequestSubmit={handleCreateClarification}
      >
        <div style={{ marginBottom: "1rem" }}>
          <TextArea
            id="clar-question"
            labelText="問題內容"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="請清楚描述您的問題..."
            rows={5}
          />
        </div>
        <div>
          <Select
            id="clar-problem"
            labelText="相關題目（選填）"
            value={newProblemId}
            onChange={(e) => setNewProblemId(e.target.value)}
          >
            <SelectItem value="" text="一般提問" />
            {problems.map((p) => (
              <SelectItem
                key={p.problemId}
                value={p.problemId}
                text={`${p.label}. ${p.title}`}
              />
            ))}
          </Select>
        </div>
      </Modal>

      {/* Create Announcement Modal */}
      <Modal
        open={announcementModalOpen}
        modalHeading="發布公告"
        primaryButtonText="發布"
        secondaryButtonText="取消"
        onRequestClose={() => setAnnouncementModalOpen(false)}
        primaryButtonDisabled={saving || !announcementTitle.trim() || !announcementContent.trim()}
        onRequestSubmit={handleCreateAnnouncement}
      >
        <div style={{ marginBottom: "1rem" }}>
          <TextInput
            id="ann-title"
            labelText="公告標題"
            value={announcementTitle}
            onChange={(e) => setAnnouncementTitle(e.target.value)}
            placeholder="輸入標題..."
          />
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <TextArea
            id="ann-content"
            labelText="公告內容"
            value={announcementContent}
            onChange={(e) => setAnnouncementContent(e.target.value)}
            placeholder="輸入內容..."
            rows={5}
          />
        </div>
      </Modal>

      {/* Reply Modal */}
      <Modal
        open={replyModalOpen}
        modalHeading="回覆提問"
        primaryButtonText="送出回覆"
        secondaryButtonText="取消"
        onRequestClose={() => setReplyModalOpen(false)}
        primaryButtonDisabled={saving || !replyText.trim()}
        onRequestSubmit={handleReply}
      >
        {selectedClar ? <div className={styles.replyContext}><MarkdownRenderer>{selectedClar.question}</MarkdownRenderer></div> : null}
        <div style={{ marginBottom: "1rem" }}>
          <TextArea
            id="reply-text"
            labelText="回覆內容"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="輸入回覆..."
            rows={5}
          />
        </div>
        <Checkbox
          id="reply-public"
          labelText="公開回覆（所有參賽者可見）"
          checked={replyIsPublic}
          onChange={(e) => setReplyIsPublic(e.target.checked)}
        />
      </Modal>

      {/* Error Modal */}
      <Modal
        open={errorModalOpen}
        modalHeading="錯誤"
        passiveModal
        onRequestClose={() => setErrorModalOpen(false)}
      >
        <p>{errorMessage}</p>
      </Modal>
      <ConfirmModal {...modalProps} />
    </div>
  );
};

export default ContestClarifications;
