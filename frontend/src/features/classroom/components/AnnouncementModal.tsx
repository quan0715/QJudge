import React, { useState, useEffect } from "react";
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
      modalHeading={isEdit ? "編輯公告" : "發佈公告"}
      primaryButtonText={
        submitting
          ? isEdit ? "儲存中..." : "發佈中..."
          : isEdit ? "儲存" : "發佈"
      }
      primaryButtonDisabled={submitting || !title.trim()}
      secondaryButtonText="取消"
      size="lg"
    >
      <div style={{ display: "grid", gap: "1rem" }}>
        <TextInput
          id="announcement-title"
          labelText="標題"
          placeholder="公告標題"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <Toggle
          id="announcement-pinned"
          labelText="置頂公告"
          labelA="否"
          labelB="是"
          toggled={isPinned}
          onToggle={(checked: boolean) => setIsPinned(checked)}
          size="sm"
        />

        <MarkdownField
          id="announcement-content"
          labelText="內容"
          value={content}
          onChange={setContent}
          placeholder="輸入公告內容，支援 Markdown 語法..."
          minHeight="250px"
        />
      </div>
    </Modal>
  );
};
