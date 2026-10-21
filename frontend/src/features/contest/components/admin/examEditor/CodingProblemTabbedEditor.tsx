import CodingProblemEditor from "@/features/problems/components/codingEditor/CodingProblemEditor";
import React, { useState } from "react";
import { IconButton, NumberInput, Tag } from "@carbon/react";
import { Code, Copy, DataBase, Draggable, TrashCan } from "@carbon/icons-react";
import { useFormContext, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { ContestProblemSummary } from "@/core/entities/contest.entity";
import { GlobalSaveStatus } from "@/shared/ui/autoSave";
import { formatScore } from "@/shared/utils/scoreFormat";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import { SaveToBankModal } from "@/features/question-banks/components/SaveToBankModal";
import { ActionRow } from "@/shared/layout/SettingsPanel";
import { useProblemEdit } from "@/features/problems/contexts/ProblemEditContext";
import type { ProblemFormSchema } from "@/features/problems/forms/problemFormSchema";
import { CODING_PROBLEM_DIFFICULTY_TAG } from "./codingProblemDifficultyDisplay";
import { isContestProblemLinkedToBank } from "./codingContestProblemBank";
import examStyles from "./ExamQuestionEditCard.module.scss";
import previewStyles from "./CodingProblemPreviewCard.module.scss";

interface CodingProblemTabbedEditorProps {
  contestProblemId: string;
  orderLabel: string;
  score?: number;
  difficulty?: string;
  frozen?: boolean;
  contestBinding: Pick<ContestProblemSummary, "sourceBank" | "sourceMode">;
  problemId: string;
  onScoreChange?: (score: number) => Promise<void>;
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
  onScoreChange,
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
  const [saveToBankOpen, setSaveToBankOpen] = useState(false);
  const [scoreDraft, setScoreDraft] = useState<number | string | null>(null);

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
    ? t("examEditor.questionLockedReason", "已有考生開始作答，競賽內容已鎖定")
    : inBank
      ? t("examEditor.saveToBankAlreadyInBank", "此題已收錄至題庫")
      : undefined;

  const titleShown =
    (typeof titleLive === "string" && titleLive.trim()) ||
    t("examEditor.codingProblemUntitled", "未定標題的程式題");

  const handleScoreBlur = () => {
    if (!onScoreChange) return;
    const currentScore = score ?? 100;
    const nextScore = Number(scoreDraft ?? currentScore);
    if (!Number.isInteger(nextScore) || nextScore <= 0) {
      setScoreDraft(null);
      return;
    }
    if (nextScore === currentScore) {
      setScoreDraft(null);
      return;
    }

    void onScoreChange(nextScore)
      .then(() => setScoreDraft(null))
      .catch(() => setScoreDraft(currentScore));
  };

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
                {t("examEditor.scoreUnit", { score: formatScore(score) })}
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
        <CodingProblemEditor scoring={onScoreChange ? (
                <ActionRow
                  label={t("examEditor.maxScoreFieldLabel", "配分")}
                  description={t("examEditor.scoreDescription", "設定此題在競賽中的最高分")}
                >
                  <NumberInput
                    id={`coding-score-${contestProblemId}`}
                    data-testid={`coding-score-input-${contestProblemId}`}
                    label={t("examEditor.maxScoreFieldLabel", "配分")}
                    className={examStyles.scoreNumberInput}
                    hideLabel
                    size="sm"
                    min={1}
                    step={1}
                    value={scoreDraft ?? score ?? 100}
                    onChange={(_event, { value }) =>
                      setScoreDraft(
                        typeof value === "number" || typeof value === "string" ? value : "",
                      )
                    }
                    onBlur={handleScoreBlur}
                    disabled={frozen}
                  />
                </ActionRow>
              ) : null} />
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

export default CodingProblemTabbedEditor;
