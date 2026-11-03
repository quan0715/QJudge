import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Modal,
  TextArea,
  TextInput,
  Button,
  Tag,
  InlineNotification,
  SkeletonText,
} from "@carbon/react";
import type {
  ContestProblemSummary,
} from "@/core/entities/contest.entity";
import {
  createContestAnnouncement,
  deleteContestAnnouncement,
} from "@/infrastructure/api/repositories";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import { useClarifications } from "@/features/contest/hooks/useClarifications";

import { TrashCan } from "@carbon/icons-react";
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

/** Participants read announcements; managers can create and delete them. */
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
    contestStatus = "published",
    contestEndTime,
    embedded = false,
    rules,
  } = props;
  const isManaging = mode === "manage";
  const {
    announcements,
    loading,
    error,
    refresh: refreshData,
  } = useClarifications(contestId);

  const [saving, setSaving] = useState(false);
  const isEnded = !!contestEndTime && new Date(contestEndTime) < new Date();
  const isReadOnly = contestStatus !== "published" || isEnded;

  // Modal states
  const announcementModalOpen = props.mode === "manage" && props.announcementOpen;
  const setAnnouncementModalOpen = (open: boolean) => {
    if (props.mode === "manage") props.onAnnouncementOpenChange(open);
  };

  // Announcement state
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementContent, setAnnouncementContent] = useState("");

  // Error Modal State
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const { confirm, modalProps } = useConfirmModal();
  const { t } = useTranslation("contest");

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setErrorModalOpen(true);
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
      showError(t("announcements.postFailed", "發布公告失敗"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAnnouncement = async (annId: string) => {
    const confirmed = await confirm({
      title: t("announcements.deleteConfirm", "確定要刪除此公告？"),
      confirmLabel: t("announcements.delete", "刪除"),
      cancelLabel: t("announcements.cancel", "取消"),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await deleteContestAnnouncement(contestId, annId);
      refreshData();
    } catch (error) {
      console.error("Failed to delete announcement", error);
      showError(t("announcements.deleteFailed", "刪除公告失敗"));
    }
  };

  if (loading) return <SkeletonText paragraph lineCount={4} />;

  return (
    <div className={`${styles.root} ${embedded ? styles.embedded : ""}`}>
      {!embedded ? <BlockHeader
        title={t("announcements.title", "公告")}
        description={isManaging ? t("announcements.descriptionStaff", "發布與管理考試公告。") : t("announcements.descriptionStudent", "查看教師發布的考試消息。")}
      /> : null}
      {error ? <InlineNotification kind="error" lowContrast hideCloseButton title={t("announcements.loadFailed", "公告載入失敗")} subtitle={t("announcements.refreshRetry", "請重新整理後再試。")} /> : null}
      {isReadOnly && rules === undefined ? <p className={styles.notice}>{isEnded ? t("announcements.endedNotice", "考試已結束，公告可供查閱，可繼續查看。") : t("announcements.unpublishedNotice", "考試尚未發布，目前不開放新增公告。")}</p> : null}
      <section className={styles.section} aria-label={t("announcements.title", "公告")}>
        <BlockHeader title={t("announcements.title", "公告")} titleAs="h3" actions={
          <div className={styles.actions}>
            <Tag size="sm" type="cool-gray">{announcements.length} {t("announcements.countUnit", "則")}</Tag>
          </div>
        } />
        {announcements.length ? <div className={styles.list}>
          {announcements.map((ann) => <article className={styles.announcement} key={ann.id}>
            <BlockHeader title={ann.title} titleAs="h4" actions={isManaging ?
              <Button kind="ghost" size="sm" hasIconOnly renderIcon={TrashCan} iconDescription={`${t("announcements.deleteLabel", "刪除公告")}：${ann.title}`} onClick={() => void handleDeleteAnnouncement(ann.id)} /> : undefined} />
            <p className={styles.meta}>{ann.createdBy || t("announcements.teacher", "教師")} · {formatDate(ann.createdAt, { includeSeconds: false })}</p>
            <MarkdownRenderer>{ann.content}</MarkdownRenderer>
          </article>)}
        </div> : <p className={styles.empty}>{t("announcements.empty", "目前沒有公告，最新考試消息會顯示在這裡。")}</p>}
      </section>
      {rules !== undefined ? (
        <section className={styles.section} aria-label={t("announcements.rules", "規則說明")}>
          <BlockHeader title={t("announcements.rules", "規則說明")} titleAs="h3" />
          {rules.trim() ? <MarkdownRenderer>{rules}</MarkdownRenderer> : null}
        </section>
      ) : null}

      {/* Create Announcement Modal */}
      <Modal
        open={announcementModalOpen}
        modalHeading={t("announcements.post", "發布公告")}
        primaryButtonText={t("announcements.publish", "發布")}
        secondaryButtonText={t("announcements.cancel", "取消")}
        onRequestClose={() => setAnnouncementModalOpen(false)}
        primaryButtonDisabled={saving || !announcementTitle.trim() || !announcementContent.trim()}
        onRequestSubmit={handleCreateAnnouncement}
      >
        <div style={{ marginBottom: "1rem" }}>
          <TextInput
            id="ann-title"
            labelText={t("announcements.titleLabel", "公告標題")}
            value={announcementTitle}
            onChange={(e) => setAnnouncementTitle(e.target.value)}
            placeholder={t("announcements.titlePlaceholder", "輸入標題...")}
          />
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <TextArea
            id="ann-content"
            labelText={t("announcements.contentLabel", "公告內容")}
            value={announcementContent}
            onChange={(e) => setAnnouncementContent(e.target.value)}
            placeholder={t("announcements.contentPlaceholder", "輸入內容...")}
            rows={5}
          />
        </div>
      </Modal>

      {/* Error Modal */}
      <Modal
        open={errorModalOpen}
        modalHeading={t("announcements.error", "錯誤")}
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
