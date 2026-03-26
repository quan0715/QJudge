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
  const { t } = useTranslation("classroom");
  const { t: tc } = useTranslation("common");
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
        title: t("settingsSaveFailed"),
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
      showToast({ kind: "success", title: t("coverUploaded") });
      await onRefresh();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("coverUploadFailed"),
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
      showToast({ kind: "success", title: t("coverUploaded") });
      await onRefresh();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("coverUploadFailed"),
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
      showToast({ kind: "success", title: t("coverRemoved") });
      await onRefresh();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("coverRemoveFailed"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <div className="settings-panel">
      <SettingsSection title={t("basicInfo")}>
        <SettingsField label={t("name")}>
          <TextInput
            id="classroom-settings-name"
            hideLabel
            labelText={t("name")}
            value={settingName}
            onChange={handleNameChange}
          />
        </SettingsField>
        <SettingsField label={t("description")} vertical>
          <TextArea
            id="classroom-settings-description"
            hideLabel
            labelText={t("description")}
            value={settingDescription}
            onChange={handleDescriptionChange}
            rows={4}
          />
        </SettingsField>
        <SettingsField label={t("icon")} vertical>
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
        <SettingsField label={t("coverImage")} vertical>
          <ImageEditDialog
            variant="cover"
            previewUrl={coverPreview || undefined}
            alt="classroom cover"
            emptyLabel={t("addCover")}
            modalHeading={t("editCover")}
            urlPlaceholder="https://images.unsplash.com/..."
            uploadLabel={t("uploadFile")}
            removeLabel={t("removeCover")}
            applyLabel={tc("apply")}
            dropzoneLabel={t("coverDropzoneTitle")}
            dropzoneHint={t("coverDropzoneHint")}
            disabled={uploadingCover}
            onUpload={handleCoverUpload}
            onApplyUrl={handleCoverUrlSubmit}
            onRemove={coverPreview ? handleRemoveCover : undefined}
          />
        </SettingsField>
      </SettingsSection>

      <SettingsSection title={t("otherInfo")}>
        <SettingsField label={t("owner")}>
          <span>{classroom.ownerUsername}</span>
        </SettingsField>
        <SettingsField label={t("createdAt")}>
          <span>{new Date(classroom.createdAt).toLocaleString()}</span>
        </SettingsField>
        <SettingsField label={t("updatedAt")}>
          <span>{new Date(classroom.updatedAt).toLocaleString()}</span>
        </SettingsField>
      </SettingsSection>
    </div>
  );
};
