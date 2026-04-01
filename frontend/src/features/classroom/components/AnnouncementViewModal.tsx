import { useState } from "react";
import { Modal, Tag } from "@carbon/react";
import { Calendar, Pin } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ClassroomAnnouncement } from "@/core/entities/classroom.entity";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";

interface AnnouncementViewModalProps {
  announcement: ClassroomAnnouncement | null;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export const AnnouncementViewModal: React.FC<AnnouncementViewModalProps> = ({
  announcement,
  canEdit,
  onClose,
  onEdit,
  onDelete,
}) => {
  const { t } = useTranslation("classroom");
  const { t: tc } = useTranslation("common");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  if (!announcement) return null;
  return (
    <>
      <Modal
        open
        passiveModal={!canEdit}
        onRequestClose={onClose}
        onRequestSubmit={onEdit}
        modalHeading={announcement.title}
        primaryButtonText={canEdit ? tc("button.edit") : undefined}
        secondaryButtonText={canEdit ? tc("button.delete") : undefined}
        onSecondarySubmit={() => setConfirmDeleteOpen(true)}
        size="lg"
        danger={false}
      >
        <div className="classroom-admin-announcement-view">
          <div className="classroom-admin-announcement-view__meta">
            {announcement.isPinned && (
              <Tag type="red" size="sm">
                <Pin size={12} /> 置頂
              </Tag>
            )}
            {announcement.createdByUsername && (
              <Tag type="high-contrast" size="sm">
                {announcement.createdByUsername}
              </Tag>
            )}
            <span>
              <Calendar size={12} />
              {new Date(announcement.createdAt).toLocaleDateString()}
            </span>
          </div>
          <div className="classroom-admin-announcement-view__body">
            <MarkdownRenderer>{announcement.content}</MarkdownRenderer>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmDeleteOpen}
        size="sm"
        danger
        modalHeading={t("confirmDeleteAnnouncementTitle")}
        primaryButtonText={tc("button.delete")}
        secondaryButtonText={tc("button.cancel")}
        onRequestClose={() => setConfirmDeleteOpen(false)}
        onRequestSubmit={() => {
          setConfirmDeleteOpen(false);
          onDelete();
        }}
      >
        <p>{t("confirmDeleteAnnouncementBody")}</p>
        <p><strong>{announcement.title}</strong></p>
      </Modal>
    </>
  );
};
