import React, { useRef, useEffect, useCallback } from "react";
import { Button, Tag } from "@carbon/react";
import { Add, Draggable } from "@carbon/icons-react";
import { Reorder, useDragControls } from "motion/react";
import { useTranslation } from "react-i18next";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import { EXAM_QUESTION_TYPE_TAG_COLOR } from "@/shared/ui/examQuestionTypeVisual";
import {
  ListItem,
  ListItemLeading,
  ListItemContent,
  ListItemTitle,
  ListItemMeta,
} from "@/shared/ui/list/ListPanel";
import styles from "./WorkTree.module.scss";
import WorkTreeShell from "./WorkTreeShell";
import { attachReorderPointerSession } from "@/shared/ui/cardListEditor";

interface WorkTreeProps {
  questions: ExamQuestion[];
  selectedId: string | null;
  frozen?: boolean;
  lockedReason?: string;
  loading?: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onImportFromBank?: () => void;
  onDelete?: (id: string) => void;
  onReorder: (reordered: ExamQuestion[]) => void;
  onReorderPointerSessionChange?: (delta: 1 | -1) => void;
}

/** Single draggable tree item */
const TreeItem: React.FC<{
  question: ExamQuestion;
  index: number;
  isActive: boolean;
  frozen?: boolean;
  onSelect: () => void;
  onReorderPointerSessionChange?: (delta: 1 | -1) => void;
}> = ({ question, index, isActive, frozen, onSelect, onReorderPointerSessionChange }) => {
  const { t } = useTranslation("contest");
  const dragControls = useDragControls();

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
        <ListItemLeading>
          {!frozen && (
            <div
              className={styles.dragHandle}
              onPointerDown={(e) => {
                e.stopPropagation();
                attachReorderPointerSession(
                  onReorderPointerSessionChange,
                  (ev) => dragControls.start(ev),
                  e,
                );
              }}
            >
              <Draggable size={14} />
            </div>
          )}
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
          </ListItemMeta>
        </ListItemContent>
      </ListItem>
    </Reorder.Item>
  );
};

const WorkTree: React.FC<WorkTreeProps> = ({
  questions,
  selectedId,
  frozen,
  loading,
  onSelect,
  onAdd,
  onReorder,
  onReorderPointerSessionChange,
}) => {
  const { t } = useTranslation("contest");
  const totalScore = questions.reduce((s, q) => s + q.score, 0);
  const listRef = useRef<HTMLDivElement>(null);
  const reorderDragDepthRef = useRef(0);

  const bumpReorderSession = useCallback(
    (delta: 1 | -1) => {
      reorderDragDepthRef.current = Math.max(0, reorderDragDepthRef.current + delta);
      onReorderPointerSessionChange?.(delta);
    },
    [onReorderPointerSessionChange],
  );

  // Auto-scroll the active item into view when selectedId changes
  useEffect(() => {
    if (!selectedId || !listRef.current) return;
    if (reorderDragDepthRef.current > 0) return;
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
            onReorderPointerSessionChange={bumpReorderSession}
          />
        ))}
      </Reorder.Group>
    </WorkTreeShell>
  );
};

export default WorkTree;
