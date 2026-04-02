import React, { useRef, useEffect, useState } from "react";
import { Button, IconButton, Tag } from "@carbon/react";
import { Add, Catalog, Draggable, TrashCan } from "@carbon/icons-react";
import { Reorder, useDragControls } from "motion/react";
import { useTranslation } from "react-i18next";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import { EXAM_QUESTION_TYPE_TAG_COLOR } from "@/shared/ui/examQuestionTypeVisual";
import { SaveToBankModal } from "@/features/question-banks/components/SaveToBankModal";
import {
  ListItem,
  ListItemLeading,
  ListItemContent,
  ListItemTitle,
  ListItemMeta,
  ListItemTrailing,
} from "@/shared/ui/list/ListPanel";
import AddQuestionMenuButton from "./AddQuestionMenuButton";
import styles from "./WorkTree.module.scss";
import WorkTreeShell from "./WorkTreeShell";

interface WorkTreeProps {
  questions: ExamQuestion[];
  selectedId: string | null;
  frozen?: boolean;
  lockedReason?: string;
  loading?: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onImportFromBank?: () => void;
  onDelete: (id: string) => void;
  onReorder: (reordered: ExamQuestion[]) => void;
}

/** Single draggable tree item */
const TreeItem: React.FC<{
  question: ExamQuestion;
  index: number;
  isActive: boolean;
  frozen?: boolean;
  onSelect: () => void;
  onDelete: () => void;
}> = ({ question, index, isActive, frozen, onSelect, onDelete }) => {
  const { t } = useTranslation("contest");
  const dragControls = useDragControls();
  const [saveToBankOpen, setSaveToBankOpen] = useState(false);
  const saveToBankDisabled =
    !!frozen ||
    !!question.sourceBank ||
    question.sourceMode === "copy" ||
    question.sourceMode === "reference";
  const saveToBankLabel = frozen
    ? t("questionEditLocked", "已有學生正式作答，競賽題目已鎖定")
    : saveToBankDisabled
      ? t("common:questionBank.saveToBank.alreadySaved", "此題已收錄至題庫")
      : t("common:questionBank.saveToBank.title", "收錄到題庫");

  const titleText = question.prompt
    ? question.prompt.replace(/[#*_`>\n]/g, "").slice(0, 40) || `Question ${index + 1}`
    : `Question ${index + 1}`;

  return (
    <Reorder.Item
      value={question}
      dragListener={false}
      dragControls={dragControls}
      drag={!frozen}
      as="div"
      data-question-id={question.id}
    >
      <ListItem active={isActive} onClick={onSelect}>
        {!frozen && (
          <ListItemLeading>
            <div
              className={styles.dragHandle}
              onPointerDown={(e) => {
                e.stopPropagation();
                dragControls.start(e);
              }}
            >
              <Draggable size={14} />
            </div>
          </ListItemLeading>
        )}
        <ListItemLeading>
          <span className={styles.itemOrder}>{index + 1}</span>
        </ListItemLeading>
        <ListItemContent>
          <ListItemTitle>{titleText}</ListItemTitle>
          <ListItemMeta>
            <Tag
              type={(EXAM_QUESTION_TYPE_TAG_COLOR[question.questionType] ?? "gray") as never}
              size="sm"
            >
              {t(`common:questionType.label.${question.questionType}`, question.questionType)}
            </Tag>
            <span className={styles.itemScore}>{question.score}pt</span>
          </ListItemMeta>
        </ListItemContent>
        <ListItemTrailing>
          <div className={styles.actionBtns}>
            <IconButton
              kind="ghost"
              size="sm"
              label={saveToBankLabel}
              disabled={saveToBankDisabled}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                if (saveToBankDisabled) return;
                setSaveToBankOpen(true);
              }}
            >
              <Catalog size={14} />
            </IconButton>
            {!frozen && (
              <IconButton
                kind="ghost"
                size="sm"
                label={t("button.delete", "刪除")}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <TrashCan size={14} />
              </IconButton>
            )}
          </div>
        </ListItemTrailing>
      </ListItem>
      <SaveToBankModal
        open={saveToBankOpen}
        onClose={() => setSaveToBankOpen(false)}
        sourceType="exam_question"
        sourceId={question.id}
        sourceTitle={titleText}
      />
    </Reorder.Item>
  );
};

const WorkTree: React.FC<WorkTreeProps> = ({
  questions,
  selectedId,
  frozen,
  lockedReason,
  loading,
  onSelect,
  onAdd,
  onImportFromBank,
  onDelete,
  onReorder,
}) => {
  const { t } = useTranslation("contest");
  const totalScore = questions.reduce((s, q) => s + q.score, 0);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the active item into view when selectedId changes
  useEffect(() => {
    if (!selectedId || !listRef.current) return;
    const activeEl = listRef.current.querySelector(
      `[data-question-id="${selectedId}"]`,
    );
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedId]);

  return (
    <WorkTreeShell
      title={t("examEditor.questionList", "題目列表")}
      actions={(
        <>
          <AddQuestionMenuButton
            onCreate={onAdd}
            onImportFromBank={onImportFromBank}
            disabled={!!frozen}
          />
        </>
      )}
      hasItems={questions.length > 0}
      loading={loading}
      emptyState={(
        <>
          <p>{t("examEditor.noQuestions", "尚無題目")}</p>
          <Button
            kind="tertiary"
            size="sm"
            renderIcon={Add}
            onClick={onAdd}
            disabled={!!frozen}
          >
            {t("examEditor.addFirstQuestion", "新增第一道題")}
          </Button>
        </>
      )}
      footer={(
        <>
          <span>{t("examEditor.questionCount", { count: questions.length })}</span>
          <span>{t("examEditor.totalScore", { score: totalScore })}</span>
          {frozen && lockedReason && <span>{lockedReason}</span>}
        </>
      )}
    >
      <Reorder.Group
        ref={listRef}
        axis="y"
        values={questions}
        onReorder={onReorder}
        as="div"
        className={styles.treeListContent}
      >
        {questions.map((q, i) => (
          <TreeItem
            key={q.id}
            question={q}
            index={i}
            isActive={selectedId === q.id}
            frozen={frozen}
            onSelect={() => onSelect(q.id)}
            onDelete={() => onDelete(q.id)}
          />
        ))}
      </Reorder.Group>
    </WorkTreeShell>
  );
};

export default WorkTree;
