import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TextInput, TextArea, Select, SelectItem } from "@carbon/react";
import type { BankVisibility, QuestionBank } from "@/core/entities/question-bank.entity";
import { useToast } from "@/shared/contexts/ToastContext";
import { Section, FieldRow, ActionRow } from "@/shared/layout/SettingsPanel";
import { ImageEditDialog } from "@/shared/ui/image";
import { PRESET_COVER_IMAGES } from "@/shared/ui/image/presetCoverImages";
import {
  update as updateQuestionBank,
  uploadCover,
} from "@/infrastructure/api/repositories/questionBank.repository";
import { CLASSROOM_ICON_OPTIONS } from "@/features/classroom/constants/classroomIcons";

const AUTO_SAVE_DELAY = 800;

interface QuestionBankSettingsGeneralPanelProps {
  bank: QuestionBank;
  onRefresh: () => Promise<void>;
}

export const QuestionBankSettingsGeneralPanel: React.FC<
  QuestionBankSettingsGeneralPanelProps
> = ({ bank, onRefresh }) => {
  const { t } = useTranslation("common");
  const { showToast } = useToast();

  const [settingName, setSettingName] = useState(bank.name);
  const [settingDescription, setSettingDescription] = useState(bank.description ?? "");
  const [settingIcon, setSettingIcon] = useState(bank.icon ?? "");
  const [settingVisibility, setSettingVisibility] = useState<BankVisibility>(
    (bank.visibility as BankVisibility) ?? "private",
  );
  const [coverPreview, setCoverPreview] = useState(bank.coverUrl ?? "");
  const [uploadingCover, setUploadingCover] = useState(false);

  const latestRef = useRef({
    name: settingName,
    description: settingDescription,
    icon: settingIcon,
    visibility: settingVisibility,
  });
  latestRef.current = {
    name: settingName,
    description: settingDescription,
    icon: settingIcon,
    visibility: settingVisibility,
  };

  const savingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSettingName(bank.name);
    setSettingDescription(bank.description ?? "");
    setSettingIcon(bank.icon ?? "");
    setSettingVisibility((bank.visibility as BankVisibility) ?? "private");
    setCoverPreview(bank.coverUrl ?? "");
  }, [bank.name, bank.description, bank.icon, bank.visibility, bank.coverUrl]);

  const saveFields = useCallback(async () => {
    if (savingRef.current) return;
    const { name, description, icon, visibility } = latestRef.current;
    if (
      name === bank.name &&
      description === (bank.description ?? "") &&
      icon === (bank.icon ?? "") &&
      visibility === ((bank.visibility as BankVisibility) ?? "private")
    )
      return;
    if (!name.trim()) return;

    savingRef.current = true;
    try {
      await updateQuestionBank(bank.id, { name, description, icon, visibility });
      await onRefresh();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    } finally {
      savingRef.current = false;
    }
  }, [bank.id, bank.name, bank.description, bank.icon, bank.visibility, onRefresh, showToast, t]);

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
    latestRef.current = { ...latestRef.current, icon: key };
    if (timerRef.current) clearTimeout(timerRef.current);
    void saveFields();
  };

  const handleVisibilityChange = (value: string) => {
    setSettingVisibility(value as BankVisibility);
    latestRef.current = { ...latestRef.current, visibility: value as BankVisibility };
    if (timerRef.current) clearTimeout(timerRef.current);
    void saveFields();
  };

  const handleCoverUpload = async (file: File) => {
    setUploadingCover(true);
    try {
      const url = await uploadCover(bank.id, file);
      setCoverPreview(url);
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: t("questionBank.coverUpdated", "封面已更新"),
      });
      await onRefresh();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("message.error"),
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
      await updateQuestionBank(bank.id, { cover_url: url });
      setCoverPreview(url);
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: t("questionBank.coverUpdated", "封面已更新"),
      });
      await onRefresh();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setUploadingCover(false);
    }
  };

  const handleRemoveCover = async () => {
    try {
      await updateQuestionBank(bank.id, { cover_url: "" });
      setCoverPreview("");
      showToast({
        kind: "success",
        title: t("message.success"),
        subtitle: t("questionBank.coverRemoved", "封面已移除"),
      });
      await onRefresh();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("message.error"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <>
      <Section title={t("questionBank.basicInfo", "基本資訊")}>
        <FieldRow
          label={t("questionBank.bankName", "題庫名稱")}
          description={t("questionBank.bankNameDesc", "顯示在題庫列表和頁首的名稱")}
        >
          <TextInput
            id="bank-name-setting"
            labelText=""
            hideLabel
            value={settingName}
            onChange={handleNameChange}
          />
        </FieldRow>
        <FieldRow
          label={t("questionBank.description", "題庫描述")}
          description={t("questionBank.descriptionDesc", "簡短描述，出現在題庫概覽頁面")}
        >
          <TextArea
            id="bank-description-setting"
            labelText=""
            hideLabel
            value={settingDescription}
            onChange={handleDescriptionChange}
            rows={3}
          />
        </FieldRow>
        <FieldRow
          label={t("questionBank.icon", "題庫圖示")}
          description={t("questionBank.iconDesc", "顯示在題庫概覽頁首")}
        >
          <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
            {CLASSROOM_ICON_OPTIONS.map((option) => {
              const selected = settingIcon === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  style={{
                    padding: "0.5rem",
                    border: selected ? "2px solid var(--cds-interactive)" : "2px solid transparent",
                    borderRadius: "4px",
                    background: selected ? "var(--cds-highlight)" : "transparent",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  onClick={() => handleIconChange(option.key)}
                  title={option.label}
                >
                  <option.Icon size={18} />
                </button>
              );
            })}
          </div>
        </FieldRow>
        <FieldRow
          label={t("questionBank.coverImage", "封面圖片")}
          description={t("questionBank.coverImageDesc", "顯示於題庫概覽頁首背景")}
        >
          <ImageEditDialog
            variant="cover"
            previewUrl={coverPreview || undefined}
            alt="question bank cover"
            emptyLabel={t("questionBank.addCover", "新增封面")}
            modalHeading={t("questionBank.editCover", "編輯封面")}
            urlPlaceholder="https://images.unsplash.com/..."
            uploadLabel={t("questionBank.uploadFile", "上傳檔案")}
            removeLabel={t("questionBank.removeCover", "移除封面")}
            applyLabel={t("button.apply", "套用")}
            dropzoneLabel={t("questionBank.coverDropzoneTitle", "拖曳圖片到此處")}
            dropzoneHint={t("questionBank.coverDropzoneHint", "支援 png / jpg / webp")}
            disabled={uploadingCover}
            galleryImages={PRESET_COVER_IMAGES}
            onUpload={handleCoverUpload}
            onApplyUrl={handleCoverUrlSubmit}
            onRemove={coverPreview ? handleRemoveCover : undefined}
          />
        </FieldRow>
        <FieldRow
          label={t("questionBank.visibility", "可見性")}
          description={t("questionBank.visibilityDesc", "公開題庫可被所有人瀏覽")}
        >
          <Select
            id="bank-visibility-setting"
            labelText=""
            hideLabel
            value={settingVisibility}
            onChange={(e) => handleVisibilityChange(e.currentTarget.value)}
          >
            <SelectItem value="private" text={t("questionBank.tagPrivate", "私人")} />
            <SelectItem value="public" text={t("questionBank.tagPublic", "公開")} />
          </Select>
        </FieldRow>
      </Section>

      <Section title={t("questionBank.otherInfo", "其他資訊")}>
        <ActionRow label={t("questionBank.category", "分類")}>
          <span>
            {bank.category === "coding"
              ? t("questionBank.categoryCoding", "程式題")
              : t("questionBank.categoryExam", "考卷題")}
          </span>
        </ActionRow>
        <ActionRow label={t("questionBank.createdAt", "建立時間")}>
          <span>{bank.createdAt ? new Date(bank.createdAt).toLocaleString() : "—"}</span>
        </ActionRow>
      </Section>
    </>
  );
};
