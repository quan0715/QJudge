import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Modal, TextInput, Toggle } from "@carbon/react";
import { MarkdownField } from "@/shared/ui/markdown/markdownEditor";
import {
  createAnnouncement,
  updateAnnouncement,
} from "@/infrastructure/api/repositories/classroom.repository";
import type { ClassroomAnnouncement } from "@/core/entities/classroom.entity";

interface AnnouncementModalProps {
  open: boolean;
  classroomId: string;
  /** Pass an existing announcement to edit; omit for create mode */
  announcement?: ClassroomAnnouncement | null;
  onClose: () => void;
  onSaved: () => void;
}

export const AnnouncementModal: React.FC<AnnouncementModalProps> = ({
  open,
  classroomId,
  announcement,
  onClose,
  onSaved,
}) => {
  const { t } = useTranslation("classroom");
  const isEdit = !!announcement;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && announcement) {
      setTitle(announcement.title);
      setContent(announcement.content);
      setIsPinned(announcement.isPinned);
    } else if (open) {
      setTitle("");
      setContent("");
      setIsPinned(false);
    }
  }, [open, announcement]);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      if (isEdit) {
        await updateAnnouncement(classroomId, announcement!.id, {
          title: title.trim(),
          content,
          is_pinned: isPinned,
        });
      } else {
        await createAnnouncement(classroomId, {
          title: title.trim(),
          content,
          is_pinned: isPinned,
        });
      }
      onSaved();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onRequestClose={onClose}
      onRequestSubmit={handleSubmit}
      modalHeading={
        isEdit ? t("announcement.modal.titleEdit") : t("announcement.modal.titleCreate")
      }
      primaryButtonText={
        submitting
          ? isEdit
            ? t("announcement.modal.submittingEdit")
            : t("announcement.modal.submittingCreate")
          : isEdit
          ? t("announcement.modal.submitEdit")
          : t("announcement.modal.submitCreate")
      }
      primaryButtonDisabled={submitting || !title.trim()}
      secondaryButtonText={t("announcement.modal.cancel")}
      size="lg"
    >
      <div style={{ display: "grid", gap: "1rem" }}>
        <TextInput
          id="announcement-title"
          labelText={t("announcement.modal.form.title")}
          placeholder={t("announcement.modal.form.titlePlaceholder")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <Toggle
          id="announcement-pinned"
          labelText={t("announcement.modal.form.pinned")}
          labelA={t("announcement.modal.form.no")}
          labelB={t("announcement.modal.form.yes")}
          toggled={isPinned}
          onToggle={(checked: boolean) => setIsPinned(checked)}
          size="sm"
        />

        <MarkdownField
          id="announcement-content"
          labelText={t("announcement.modal.form.content")}
          value={content}
          onChange={setContent}
          placeholder={t("announcement.modal.form.contentPlaceholder")}
          minHeight="250px"
        />
      </div>
    </Modal>
  );
};
