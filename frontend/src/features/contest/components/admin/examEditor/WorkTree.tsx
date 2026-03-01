import React, { useRef, useEffect } from "react";
import { Button, IconButton, Tag } from "@carbon/react";
import { Add, Draggable, TrashCan } from "@carbon/icons-react";
import { Reorder, useDragControls } from "motion/react";
import type { ExamQuestion, ExamQuestionType } from "@/core/entities/contest.entity";
import styles from "./WorkTree.module.scss";
import WorkTreeShell from "./WorkTreeShell";

const TYPE_LABEL: Record<ExamQuestionType, string> = {
  true_false: "是非",
  single_choice: "單選",
  multiple_choice: "多選",
  short_answer: "簡答",
  essay: "問答",
};

const TYPE_TAG_COLOR: Record<string, string> = {
  true_false: "purple",
  single_choice: "blue",
  multiple_choice: "teal",
  short_answer: "green",
  essay: "warm-gray",
};

interface WorkTreeProps {
  questions: ExamQuestion[];
  selectedId: string | null;
  frozen?: boolean;
  loading?: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
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
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={question}
      dragListener={false}
      dragControls={dragControls}
      drag={!frozen}
      as="div"
      className={`${styles.treeItem} ${isActive ? styles.treeItemActive : ""}`}
      data-question-id={question.id}
    >
      {!frozen && (
        <div
          className={styles.dragHandle}
          onPointerDown={(e) => dragControls.start(e)}
        >
          <Draggable size={14} />
        </div>
      )}
      <button
        type="button"
        className={styles.itemButton}
        onClick={onSelect}
      >
        <span className={styles.itemOrder}>{index + 1}</span>
        <div className={styles.itemInfo}>
          <span className={styles.itemTitle}>
            {question.prompt
              ? question.prompt.replace(/[#*_`>\n]/g, "").slice(0, 40) || `Question ${index + 1}`
              : `Question ${index + 1}`}
          </span>
          <div className={styles.itemMeta}>
            <Tag
              type={(TYPE_TAG_COLOR[question.questionType] ?? "gray") as never}
              size="sm"
            >
              {TYPE_LABEL[question.questionType] ?? question.questionType}
            </Tag>
            <span className={styles.itemScore}>{question.score}pt</span>
          </div>
        </div>
      </button>
      {!frozen && (
        <div className={styles.deleteBtn}>
          <IconButton
            kind="ghost"
            size="sm"
            label="刪除"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <TrashCan size={14} />
          </IconButton>
        </div>
      )}
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
  onDelete,
  onReorder,
}) => {
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
      title="題目列表"
      actions={(
        !frozen && (
          <Button
            kind="ghost"
            renderIcon={Add}
            hasIconOnly
            iconDescription="新增題目"
            onClick={onAdd}
          />
        )
      )}
      hasItems={questions.length > 0}
      loading={loading}
      emptyState={(
        <>
          <p>尚無題目</p>
          {!frozen && (
            <Button kind="tertiary" size="sm" renderIcon={Add} onClick={onAdd}>
              新增第一道題
            </Button>
          )}
        </>
      )}
      footer={(
        <>
          <span>{questions.length} 題</span>
          <span>總分 {totalScore}</span>
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
