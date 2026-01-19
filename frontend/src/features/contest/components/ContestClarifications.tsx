import { useState } from "react";
import {
  Modal,
  TextArea,
  Checkbox,
  Select,
  SelectItem,
  TextInput,
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
import { DiscussionsSection } from "@/features/contest/components/DiscussionsSection";
import { AnnouncementsSection } from "@/features/contest/components/AnnouncementsSection";
import { AnnouncementCard } from "@/shared/ui/announcement";
import { ProblemDiscussionThread } from "@/shared/ui/discussion";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import { useClarifications } from "@/features/contest/hooks/useClarifications";

interface ContestClarificationsProps {
  contestId: string;
  isTeacherOrAdmin: boolean;
  problems?: ContestProblemSummary[];
  contestStatus?: string;
  contestEndTime?: string;
}

const ContestClarifications: React.FC<ContestClarificationsProps> = ({
  contestId,
  isTeacherOrAdmin,
  problems = [],
  contestStatus = "published",
  contestEndTime,
}) => {
  const {
    clarifications,
    announcements,
    loading,
    refresh: refreshData,
  } = useClarifications(contestId);

  const isEnded = !!contestEndTime && new Date(contestEndTime) < new Date();
  const isReadOnly = contestStatus !== "published" || isEnded;

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [replyModalOpen, setReplyModalOpen] = useState(false);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);

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
    if (!newContent) return;

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
    }
  };

  const handleCreateAnnouncement = async () => {
    if (!announcementTitle || !announcementContent) return;

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
    }
  };

  const handleReply = async () => {
    if (!selectedClar || !replyText) return;

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
    }
  };

  const openReplyModal = (clar: Clarification) => {
    setSelectedClar(clar);
    setReplyText(clar.answer || "");
    setReplyIsPublic(clar.isPublic);
    setReplyModalOpen(true);
  };

  if (loading) {
    return <div>載入中...</div>;
  }

  return (
    <div className="contest-clarifications">
      {/* Announcements Section */}
      <AnnouncementsSection
        title="公告"
        action={
          !isReadOnly && isTeacherOrAdmin
            ? {
                label: "發布公告",
                onClick: () => setAnnouncementModalOpen(true),
              }
            : undefined
        }
      >
        {announcements.length === 0 ? (
          <div
            style={{
              padding: "2rem",
              textAlign: "center",
              color: "var(--cds-text-secondary)",
            }}
          >
            目前沒有任何公告
          </div>
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            {announcements.map((ann) => (
              <AnnouncementCard
                key={ann.id}
                announcement={{
                  id: Number(ann.id),
                  title: ann.title,
                  content: ann.content,
                  created_at: ann.createdAt,
                  updated_at: ann.createdAt,
                  visible: true,
                  author: { username: ann.createdBy || "", role: "teacher" },
                }}
                maxContentLength={0}
                canDelete={isTeacherOrAdmin}
                onDelete={(id) => handleDeleteAnnouncement(String(id))}
                formatDate={(dateStr) => new Date(dateStr).toLocaleString()}
              />
            ))}
          </div>
        )}
      </AnnouncementsSection>

      {/* Q&A Section */}
      <DiscussionsSection
        title="學生提問與討論"
        action={
          !isReadOnly
            ? {
                label: "提出問題",
                onClick: () => setModalOpen(true),
              }
            : undefined
        }
      >
        {clarifications.length === 0 ? (
          <div
            style={{
              padding: "2rem",
              textAlign: "center",
              color: "var(--cds-text-secondary)",
            }}
          >
            目前還沒有任何提問
          </div>
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
          >
            {clarifications.map((clar) => (
              <ProblemDiscussionThread
                key={clar.id}
                id={clar.id}
                content={clar.question}
                problemTitle={clar.problemTitle}
                replies={
                  clar.answer
                    ? [
                        {
                          id: `${clar.id}-reply`,
                          content: clar.answer,
                          authorUsername: clar.answeredBy,
                          createdAt: clar.updatedAt,
                          likeCount: 0, // TODO: 後端整合
                          isLiked: false,
                        },
                      ]
                    : undefined
                }
                authorUsername={clar.authorUsername}
                createdAt={clar.createdAt}
                likeCount={0} // TODO: 後端整合
                isLiked={false}
                canReply={isTeacherOrAdmin}
                canDelete={isTeacherOrAdmin}
                onReply={(_parentId, _type) => openReplyModal(clar)}
                onDelete={(id, _type) => handleDeleteClarification(String(id))}
                onLike={(id, type) =>
                  console.log("TODO: 後端整合 - Like", id, type)
                }
              />
            ))}
          </div>
        )}
      </DiscussionsSection>

      {/* Create Clarification Modal */}
      <Modal
        open={modalOpen}
        modalHeading="提出問題"
        primaryButtonText="送出"
        secondaryButtonText="取消"
        onRequestClose={() => setModalOpen(false)}
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
        onRequestSubmit={handleReply}
      >
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
