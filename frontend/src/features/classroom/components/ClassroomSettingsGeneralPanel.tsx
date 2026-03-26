import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TextInput, TextArea } from "@carbon/react";
import type { ClassroomDetail } from "@/core/entities/classroom.entity";
import { useToast } from "@/shared/contexts/ToastContext";
import { SettingsSection, SettingsField } from "@/features/auth/components/SettingsSection";
import { ImageEditDialog } from "@/shared/ui/image";
import {
  updateClassroom,
  uploadClassroomCover,
} from "@/infrastructure/api/repositories/classroom.repository";
import { CLASSROOM_ICON_OPTIONS } from "../constants/classroomIcons";

const AUTO_SAVE_DELAY = 800;

interface ClassroomSettingsGeneralPanelProps {
  classroom: ClassroomDetail;
  onRefresh: () => Promise<void>;
}

export const ClassroomSettingsGeneralPanel: React.FC<ClassroomSettingsGeneralPanelProps> = ({
  classroom,
  onRefresh,
}) => {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [settingName, setSettingName] = useState(classroom.name);
  const [settingDescription, setSettingDescription] = useState(classroom.description ?? "");
  const [settingIcon, setSettingIcon] = useState(classroom.icon ?? "");
  const [coverPreview, setCoverPreview] = useState(classroom.coverUrl ?? "");
  const [uploadingCover, setUploadingCover] = useState(false);

  // Keep a ref of the latest values for auto-save to avoid stale closures
  const latestRef = useRef({ name: settingName, description: settingDescription, icon: settingIcon });
  latestRef.current = { name: settingName, description: settingDescription, icon: settingIcon };

  const savingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSettingName(classroom.name);
    setSettingDescription(classroom.description ?? "");
    setSettingIcon(classroom.icon ?? "");
    setCoverPreview(classroom.coverUrl ?? "");
  }, [classroom.name, classroom.description, classroom.icon, classroom.coverUrl]);

  const saveFields = useCallback(async () => {
    if (savingRef.current) return;
    const { name, description, icon } = latestRef.current;
    if (
      name === classroom.name &&
      description === (classroom.description ?? "") &&
      icon === (classroom.icon ?? "")
    ) return;
    if (!name.trim()) return;

    savingRef.current = true;
    try {
      await updateClassroom(classroom.id, { name, description, icon });
      await onRefresh();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("classroom.settingsSaveFailed", "儲存設定失敗"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    } finally {
      savingRef.current = false;
    }
  }, [classroom.id, classroom.name, classroom.description, classroom.icon, onRefresh, showToast, t]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void saveFields();
    }, AUTO_SAVE_DELAY);
  }, [saveFields]);

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        void saveFields();
      }
    };
  }, [saveFields]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSettingName(e.target.value);
    scheduleSave();
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSettingDescription(e.target.value);
    scheduleSave();
  };

  const handleIconChange = (key: string) => {
    setSettingIcon(key);
    // Icon change is instant — save immediately
    latestRef.current = { ...latestRef.current, icon: key };
    if (timerRef.current) clearTimeout(timerRef.current);
    void saveFields();
  };

  const handleCoverUpload = async (file: File) => {
    setUploadingCover(true);
    try {
      const url = await uploadClassroomCover(classroom.id, file);
      setCoverPreview(url);
      showToast({ kind: "success", title: t("classroom.coverUploaded", "封面圖片已更新") });
      await onRefresh();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("classroom.coverUploadFailed", "上傳封面失敗"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setUploadingCover(false);
    }
  };

  const handleCoverUrlSubmit = async (urlInput: string) => {
    const url = urlInput.trim();
    if (!url) return;
    setUploadingCover(true);
    try {
      await updateClassroom(classroom.id, { cover_url: url });
      setCoverPreview(url);
      showToast({ kind: "success", title: t("classroom.coverUploaded", "封面圖片已更新") });
      await onRefresh();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("classroom.coverUploadFailed", "更新封面失敗"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setUploadingCover(false);
    }
  };

  const handleRemoveCover = async () => {
    try {
      await updateClassroom(classroom.id, { cover_url: "" });
      setCoverPreview("");
      showToast({ kind: "success", title: t("classroom.coverRemoved", "封面圖片已移除") });
      await onRefresh();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("classroom.coverRemoveFailed", "移除封面失敗"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <div className="settings-panel">
      <SettingsSection title={t("classroom.basicInfo", "基本資訊")}>
        <SettingsField label={t("classroom.name", "教室名稱")}>
          <TextInput
            id="classroom-settings-name"
            hideLabel
            labelText={t("classroom.name", "教室名稱")}
            value={settingName}
            onChange={handleNameChange}
          />
        </SettingsField>
        <SettingsField label={t("classroom.description", "教室描述")} vertical>
          <TextArea
            id="classroom-settings-description"
            hideLabel
            labelText={t("classroom.description", "教室描述")}
            value={settingDescription}
            onChange={handleDescriptionChange}
            rows={4}
          />
        </SettingsField>
        <SettingsField label={t("classroom.icon", "教室圖示")} vertical>
          <div className="classroom-icon-picker">
            {CLASSROOM_ICON_OPTIONS.map((opt) => {
              const isSelected = settingIcon === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  className={`classroom-icon-picker__item${isSelected ? " classroom-icon-picker__item--active" : ""}`}
                  title={opt.label}
                  onClick={() => handleIconChange(opt.key)}
                >
                  <opt.Icon size={20} />
                </button>
              );
            })}
          </div>
        </SettingsField>
        <SettingsField label={t("classroom.coverImage", "封面圖片")} vertical>
          <ImageEditDialog
            variant="cover"
            previewUrl={coverPreview || undefined}
            alt="classroom cover"
            emptyLabel={t("classroom.addCover", "新增封面")}
            modalHeading={t("classroom.editCover", "編輯封面圖片")}
            urlPlaceholder="https://images.unsplash.com/..."
            uploadLabel={t("classroom.uploadFile", "上傳圖片")}
            removeLabel={t("classroom.removeCover", "移除封面")}
            applyLabel={t("common.apply", "套用")}
            dropzoneLabel={t("classroom.coverDropzoneTitle", "拖曳封面圖片到此處")}
            dropzoneHint={t("classroom.coverDropzoneHint", "或點擊這裡選擇圖片檔案")}
            disabled={uploadingCover}
            onUpload={handleCoverUpload}
            onApplyUrl={handleCoverUrlSubmit}
            onRemove={coverPreview ? handleRemoveCover : undefined}
          />
        </SettingsField>
      </SettingsSection>

      <SettingsSection title={t("classroom.otherInfo", "其他資訊")}>
        <SettingsField label={t("classroom.owner", "建立者")}>
          <span>{classroom.ownerUsername}</span>
        </SettingsField>
        <SettingsField label={t("classroom.createdAt", "建立時間")}>
          <span>{new Date(classroom.createdAt).toLocaleString()}</span>
        </SettingsField>
        <SettingsField label={t("classroom.updatedAt", "最後更新")}>
          <span>{new Date(classroom.updatedAt).toLocaleString()}</span>
        </SettingsField>
      </SettingsSection>
    </div>
  );
};
