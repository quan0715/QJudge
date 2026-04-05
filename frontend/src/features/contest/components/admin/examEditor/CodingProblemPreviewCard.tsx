import React, { useState } from "react";
import { Layer, Tag, IconButton } from "@carbon/react";
import { Code, Copy, DataBase, Draggable, TrashCan } from "@carbon/icons-react";
import { useContentLanguage } from "@/shared/contexts/ContentLanguageContext";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import type { ContestProblemSummary } from "@/core/entities/contest.entity";
import type { ProblemDetail } from "@/core/entities/problem.entity";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import { SaveToBankModal } from "@/features/question-banks/components/SaveToBankModal";
import { useTranslation } from "react-i18next";
import { CODING_PROBLEM_DIFFICULTY_TAG } from "./codingProblemDifficultyDisplay";
import { isContestProblemLinkedToBank } from "./codingContestProblemBank";
import examStyles from "./ExamQuestionEditCard.module.scss";
import previewStyles from "./CodingProblemPreviewCard.module.scss";

interface CodingProblemPreviewCardProps {
  /** Contest order label (A, B, …). */
  orderLabel: string;
  displayTitle: string;
  score?: number;
  problem: ProblemDetail;
  frozen?: boolean;
  contestBinding: Pick<ContestProblemSummary, "sourceBank" | "sourceMode">;
  problemId: string;
  onSaveToBankSuccess?: () => void;
  onClick?: () => void;
  onPointerDownDrag?: (e: React.PointerEvent) => void;
  onDuplicate?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}

const CodingProblemPreviewCard: React.FC<CodingProblemPreviewCardProps> = ({
  orderLabel,
  displayTitle,
  score,
  problem,
  frozen = false,
  contestBinding,
  problemId,
  onSaveToBankSuccess,
  onClick,
  onPointerDownDrag,
  onDuplicate,
  onDelete,
}) => {
  const { t } = useTranslation("contest");
  const { contentLanguage } = useContentLanguage();
  const { confirm, modalProps } = useConfirmModal();
  const [saveToBankOpen, setSaveToBankOpen] = useState(false);

  const handleClick = () => {
    if (!frozen && onClick) onClick();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (frozen) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.();
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDelete || frozen) return;
    const accepted = await confirm({
      title: t("examEditor.confirmRemoveProblem", "確定要從競賽移除此題？"),
      danger: true,
      confirmLabel: t("button.delete", "刪除"),
      cancelLabel: t("button.cancel", "取消"),
    });
    if (accepted) await onDelete();
  };

  const translation =
    problem.translations?.find((tr) => tr.language === contentLanguage) ||
    (contentLanguage === "zh-TW"
      ? problem.translations?.find((tr) => tr.language === "zh-hant")
      : null) ||
    problem.translations?.[0];

  const description = translation?.description || problem.description;
  const difficultyKey = problem.difficulty ?? "";
  const diffMeta =
    difficultyKey && CODING_PROBLEM_DIFFICULTY_TAG[difficultyKey]
      ? CODING_PROBLEM_DIFFICULTY_TAG[difficultyKey]
      : null;

  const inBank = isContestProblemLinkedToBank(contestBinding);
  const saveToBankDisabled = !!frozen || inBank;
  const saveToBankLabel = frozen
    ? t("examEditor.questionLockedReason", "已有學生正式作答，競賽題目已鎖定")
    : inBank
      ? t("examEditor.saveToBankAlreadyInBank", "此題已收錄至題庫")
      : undefined;

  const titleShown =
    (displayTitle || "").trim() || t("examEditor.codingProblemUntitled", "未定標題的程式題");

  return (
    <>
      <Layer>
        <div
          className={`${examStyles.card} ${examStyles.cardPreview}`}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={frozen ? -1 : 0}
        >
          {!frozen && onPointerDownDrag && (
            <div
              className={examStyles.dragIndicator}
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
                    title={saveToBankLabel}
                    disabled={saveToBankDisabled}
                    onClick={(e) => {
                      e.stopPropagation();
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
                {score != null ? (
                  <span className={examStyles.score}>
                    {t("examEditor.scoreUnit", { score })}
                  </span>
                ) : null}
                {!frozen && (onDuplicate || onDelete) ? (
                  <>
                    {onDuplicate ? (
                      <IconButton
                        kind="ghost"
                        size="sm"
                        label={t("examEditor.actions.copy", "複製")}
                        onClick={(e) => {
                          e.stopPropagation();
                          void onDuplicate();
                        }}
                      >
                        <Copy size={16} />
                      </IconButton>
                    ) : null}
                    {onDelete ? (
                      <IconButton
                        kind="ghost"
                        size="sm"
                        label={t("examEditor.actions.delete", "刪除")}
                        onClick={(e) => void handleDelete(e)}
                      >
                        <TrashCan size={16} />
                      </IconButton>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>

            <div className={previewStyles.titleLine}>{titleShown}</div>

            {description ? (
              <div className={previewStyles.descriptionCompact}>
                <MarkdownRenderer enableMath enableHighlight enableCopy>
                  {description}
                </MarkdownRenderer>
              </div>
            ) : (
              <div className={previewStyles.descriptionEmpty}>
                {t("examEditor.promptEmpty", "（尚未填寫題目敘述）")}
              </div>
            )}
          </div>
        </div>
      </Layer>
      <SaveToBankModal
        open={saveToBankOpen}
        onClose={() => setSaveToBankOpen(false)}
        sourceType="problem"
        sourceId={problemId}
        sourceTitle={titleShown}
        onSaved={onSaveToBankSuccess}
      />
      <ConfirmModal {...modalProps} />
    </>
  );
};

export default CodingProblemPreviewCard;
