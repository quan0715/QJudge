import React, { useMemo, useState } from "react";
import { IconButton, Tab, TabList, TabPanel, TabPanels, Tabs, Tag } from "@carbon/react";
import { Draggable, TrashCan } from "@carbon/icons-react";
import { useFormContext, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { GlobalSaveStatus } from "@/shared/ui/autoSave";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import { ProblemPreview } from "@/shared/ui/problem";
import { useProblemEdit } from "@/features/problems/contexts/ProblemEditContext";
import type { ProblemFormSchema } from "@/features/problems/forms/problemFormSchema";
import { formSchemaToPreview } from "@/features/problems/screens/problemsIdEdit/utils/previewAdapter";
import ContentSection from "@/features/problems/components/edit/problemForm/sections/ContentSection";
import TestCasesSection from "@/features/problems/components/edit/problemForm/sections/TestCasesSection";
import BasicInfoSection from "@/features/problems/components/edit/problemForm/sections/BasicInfoSection";
import LanguageConfigSection from "@/features/problems/components/edit/problemForm/sections/LanguageConfigSection";
import styles from "./CodingProblemTabbedEditor.module.scss";

interface CodingProblemTabbedEditorProps {
  label?: string;
  title: string;
  score?: number;
  difficulty?: string;
  onDelete?: () => Promise<void>;
  onPointerDownDrag?: (e: React.PointerEvent) => void;
}

const CodingProblemTabbedEditor: React.FC<CodingProblemTabbedEditorProps> = ({
  label,
  title,
  score,
  difficulty,
  onDelete,
  onPointerDownDrag,
}) => {
  const { t } = useTranslation("contest");
  const { autoSave } = useProblemEdit();
  const { confirm, modalProps } = useConfirmModal();
  const [activeTab, setActiveTab] = useState(0);

  const showSaveStatus = autoSave.globalStatus !== "idle";

  const handleDelete = async () => {
    if (!onDelete) return;
    const accepted = await confirm({
      title: t("examEditor.confirmRemoveProblem", "確定要從競賽移除此題？"),
      danger: true,
      confirmLabel: t("button.delete", "刪除"),
      cancelLabel: t("button.cancel", "取消"),
    });
    if (accepted) await onDelete();
  };

  return (
    <div className={styles.root}>
      {/* Drag handle */}
      {onPointerDownDrag && (
        <div
          className={styles.dragIndicator}
          onPointerDown={(e) => {
            e.stopPropagation();
            onPointerDownDrag(e);
          }}
        >
          <Draggable size={16} />
        </div>
      )}

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {label && <span className={styles.label}>{label}.</span>}
          <span className={styles.title}>{title || "Untitled"}</span>
        </div>
        <div className={styles.headerRight}>
          {showSaveStatus && <GlobalSaveStatus status={autoSave.globalStatus} />}
          {difficulty && (
            <Tag
              type={
                difficulty === "easy"
                  ? "green"
                  : difficulty === "medium"
                    ? "blue"
                    : "red"
              }
              size="sm"
            >
              {difficulty}
            </Tag>
          )}
          {score != null && (
            <Tag type="high-contrast" size="sm">{score} pt</Tag>
          )}
          {onDelete && (
            <IconButton kind="ghost" size="sm" label={t("button.delete", "刪除")} onClick={() => void handleDelete()}>
              <TrashCan size={16} />
            </IconButton>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        selectedIndex={activeTab}
        onChange={({ selectedIndex }) => setActiveTab(selectedIndex)}
      >
        <TabList aria-label={t("examEditor.problemEditTabs", "題目編輯分頁")} contained>
          <Tab>{t("examEditor.tabBasicInfo", "基本資訊")}</Tab>
          <Tab>{t("examEditor.tabContent", "題目內容")}</Tab>
          <Tab>{t("examEditor.tabTestCases", "測資")}</Tab>
          <Tab>{t("examEditor.tabCodeSettings", "撰寫設定")}</Tab>
          <Tab>{t("examEditor.tabPreview", "預覽")}</Tab>
        </TabList>
        <TabPanels>
          <TabPanel className={styles.tabPanel}>
            <BasicInfoSection />
          </TabPanel>
          <TabPanel className={styles.tabPanel}>
            <ContentSection directEdit />
          </TabPanel>
          <TabPanel className={styles.tabPanel}>
            <TestCasesSection />
          </TabPanel>
          <TabPanel className={styles.tabPanel}>
            <LanguageConfigSection />
          </TabPanel>
          <TabPanel className={styles.tabPanel}>
            <PreviewTab />
          </TabPanel>
        </TabPanels>
      </Tabs>
      <ConfirmModal {...modalProps} />
    </div>
  );
};

/** Score display — contest-level score is shown in the header tag, not editable inline here */

/** Live preview using current form values */
const PreviewTab: React.FC = () => {
  const { control } = useFormContext<ProblemFormSchema>();
  const formValues = useWatch({ control });
  const previewData = useMemo(
    () => formSchemaToPreview(formValues as ProblemFormSchema),
    [formValues],
  );
  return <ProblemPreview problem={previewData} />;
};

export default CodingProblemTabbedEditor;
