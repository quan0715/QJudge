import React, { useMemo, useState } from "react";
import { IconButton, Tab, TabList, TabPanel, TabPanels, Tabs, Tag } from "@carbon/react";
import { Code, Copy, DataBase, Draggable, TrashCan } from "@carbon/icons-react";
import { useFormContext, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { ContestProblemSummary } from "@/core/entities/contest.entity";
import { GlobalSaveStatus } from "@/shared/ui/autoSave";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import { SaveToBankModal } from "@/features/question-banks/components/SaveToBankModal";
import { ProblemPreview } from "@/shared/ui/problem";
import { useProblemEdit } from "@/features/problems/contexts/ProblemEditContext";
import type { ProblemFormSchema } from "@/features/problems/forms/problemFormSchema";
import { formSchemaToPreview } from "@/features/problems/screens/problemsIdEdit/utils/previewAdapter";
import ContentSection from "@/features/problems/components/edit/problemForm/sections/ContentSection";
import TestCasesSection from "@/features/problems/components/edit/problemForm/sections/TestCasesSection";
import BasicInfoSection from "@/features/problems/components/edit/problemForm/sections/BasicInfoSection";
import LanguageConfigSection from "@/features/problems/components/edit/problemForm/sections/LanguageConfigSection";
import { CODING_PROBLEM_DIFFICULTY_TAG } from "./codingProblemDifficultyDisplay";
import { isContestProblemLinkedToBank } from "./codingContestProblemBank";
import examStyles from "./ExamQuestionEditCard.module.scss";
import previewStyles from "./CodingProblemPreviewCard.module.scss";
import styles from "./CodingProblemTabbedEditor.module.scss";

interface CodingProblemTabbedEditorProps {
  contestProblemId: string;
  orderLabel: string;
  score?: number;
  difficulty?: string;
  frozen?: boolean;
  contestBinding: Pick<ContestProblemSummary, "sourceBank" | "sourceMode">;
  problemId: string;
  onSaveToBankSuccess?: () => void;
  onDelete?: () => Promise<void>;
  onDuplicate?: () => void | Promise<void>;
  onPointerDownDrag?: (e: React.PointerEvent) => void;
}

const CodingProblemTabbedEditor: React.FC<CodingProblemTabbedEditorProps> = ({
  contestProblemId,
  orderLabel,
  score,
  difficulty,
  frozen = false,
  contestBinding,
  problemId,
  onSaveToBankSuccess,
  onDelete,
  onDuplicate,
  onPointerDownDrag,
}) => {
  const { t } = useTranslation("contest");
  const { control } = useFormContext<ProblemFormSchema>();
  const titleLive = useWatch({ control, name: "title", defaultValue: "" });
  const { autoSave } = useProblemEdit();
  const { confirm, modalProps } = useConfirmModal();
  const [activeTab, setActiveTab] = useState(0);
  const [saveToBankOpen, setSaveToBankOpen] = useState(false);

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

  const diffMeta =
    difficulty && CODING_PROBLEM_DIFFICULTY_TAG[difficulty]
      ? CODING_PROBLEM_DIFFICULTY_TAG[difficulty]
      : null;

  const inBank = isContestProblemLinkedToBank(contestBinding);
  const saveToBankDisabled = !!frozen || inBank;
  const saveToBankTitle = frozen
    ? t("examEditor.questionLockedReason", "已有學生正式作答，競賽題目已鎖定")
    : inBank
      ? t("examEditor.saveToBankAlreadyInBank", "此題已收錄至題庫")
      : undefined;

  const titleShown =
    (typeof titleLive === "string" && titleLive.trim()) ||
    t("examEditor.codingProblemUntitled", "未定標題的程式題");

  return (
    <div className={`${examStyles.card} ${examStyles.cardEditing}`}>
      {onPointerDownDrag && (
        <div
          className={examStyles.dragIndicator}
          data-testid={`coding-card-reorder-${contestProblemId}`}
          onPointerDown={(e) => {
            e.stopPropagation();
            onPointerDownDrag(e);
          }}
        >
          <Draggable size={16} />
        </div>
      )}

      <div className={examStyles.previewBody}>
        <div className={examStyles.header}>
          <span className={examStyles.label}>
            {t("examEditor.codingProblemWithLabel", { label: orderLabel })}{" "}
            <Tag size="sm" type="blue">
              <span className={examStyles.typeTagContent}>
                <Code size={12} />
                {t("answering.questionTypes.coding", "程式題")}
              </span>
            </Tag>
            {diffMeta ? (
              <Tag size="sm" type={diffMeta.color as never}>
                {diffMeta.label}
              </Tag>
            ) : null}
            {contestBinding.sourceBank ? (
              <Tag size="sm" type="blue" className={examStyles.sourceBankTag}>
                <DataBase size={12} />
                {contestBinding.sourceBank.name}
              </Tag>
            ) : !frozen ? (
              <button
                type="button"
                className={examStyles.saveToBankButton}
                data-testid={`coding-card-save-to-bank-${contestProblemId}`}
                title={saveToBankTitle}
                disabled={saveToBankDisabled}
                onClick={() => {
                  if (saveToBankDisabled) return;
                  setSaveToBankOpen(true);
                }}
              >
                <DataBase size={12} />
                {t("examEditor.saveToBank", "收錄到題庫")}
              </button>
            ) : null}
          </span>
          <div className={examStyles.headerRight}>
            {showSaveStatus && <GlobalSaveStatus status={autoSave.globalStatus} />}
            {score != null ? (
              <span className={examStyles.score}>
                {t("examEditor.scoreUnit", { score })}
              </span>
            ) : null}
            {onDuplicate ? (
              <IconButton
                kind="ghost"
                size="sm"
                label={t("examEditor.actions.copy", "複製")}
                data-testid={`coding-card-duplicate-${contestProblemId}`}
                onClick={() => void onDuplicate()}
              >
                <Copy size={16} />
              </IconButton>
            ) : null}
            {onDelete ? (
              <IconButton
                kind="ghost"
                size="sm"
                label={t("examEditor.actions.delete", "刪除")}
                data-testid={`coding-card-delete-${contestProblemId}`}
                onClick={() => void handleDelete()}
              >
                <TrashCan size={16} />
              </IconButton>
            ) : null}
          </div>
        </div>

        <div className={previewStyles.titleLine}>{titleShown}</div>
      </div>

      <div className={examStyles.editBody}>
        <Tabs
          selectedIndex={activeTab}
          onChange={({ selectedIndex }) => setActiveTab(selectedIndex ?? 0)}
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
      </div>
      <SaveToBankModal
        open={saveToBankOpen}
        onClose={() => setSaveToBankOpen(false)}
        sourceType="problem"
        sourceId={problemId}
        sourceTitle={titleShown}
        onSaved={onSaveToBankSuccess}
      />
      <ConfirmModal {...modalProps} />
    </div>
  );
};

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
