import React, { useRef, useEffect, useCallback } from "react";
import { Button } from "@carbon/react";
import { Add, Draggable, GroupObjects } from "@carbon/icons-react";
import { Reorder, useDragControls } from "motion/react";
import { useTranslation } from "react-i18next";
import type { ExamPaperBlock } from "@/core/entities/contest.entity";
import { EXAM_QUESTION_TYPE_ICON } from "@/shared/ui/examQuestionTypeVisual";
import {
  ListItem,
  ListItemLeading,
  ListItemContent,
  ListItemTitle,
  ListItemMeta,
} from "@/shared/ui/list/ListPanel";
import { formatScore } from "@/shared/utils/scoreFormat";
import styles from "./WorkTree.module.scss";
import WorkTreeShell from "./WorkTreeShell";
import { attachReorderPointerSession } from "@/shared/ui/cardListEditor";

interface WorkTreeProps {
  blocks: ExamPaperBlock[];
  selectedId: string | null;
  frozen?: boolean;
  lockedReason?: string;
  loading?: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onImportFromBank?: () => void;
  onDelete?: (id: string) => void;
  onReorder: (reordered: ExamPaperBlock[]) => void;
  onReorderPointerSessionChange?: (delta: 1 | -1) => void;
}

/** Single draggable tree item */
const TreeItem: React.FC<{
  block: ExamPaperBlock;
  index: number;
  isActive: boolean;
  frozen?: boolean;
  onSelect: () => void;
  onReorderPointerSessionChange?: (delta: 1 | -1) => void;
}> = ({ block, index, isActive, frozen, onSelect, onReorderPointerSessionChange }) => {
  const { t } = useTranslation("contest");
  const dragControls = useDragControls();
  const question = block.kind === "question" ? block.question : block.children[0];
  const typeLabel =
    block.kind === "group"
      ? t("examEditor.groupBlock", "題組")
      : t(
          `common:questionType.label.${block.question.questionType}`,
          block.question.questionType,
        );
  const TypeIcon =
    block.kind === "group" ? GroupObjects : EXAM_QUESTION_TYPE_ICON[block.question.questionType];

  const titleText =
    block.kind === "group"
      ? block.group.title || t("examEditor.groupBlock", "題組")
      : question?.prompt
        ? question.prompt.replace(/[#*_`>\n]/g, "").slice(0, 40) || `Question ${index + 1}`
        : `Question ${index + 1}`;

  return (
    <Reorder.Item
      value={block}
      dragListener={false}
      dragControls={dragControls}
      drag={!frozen}
      as="div"
      data-question-id={block.id}
    >
      <ListItem active={isActive} onClick={onSelect}>
        <ListItemLeading>
          {!frozen && (
            <div
              className={styles.dragHandle}
              data-testid={`worktree-drag-${block.id}`}
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
            <span
              className={styles.itemTypeIcon}
              role="img"
              aria-label={typeLabel}
              title={typeLabel}
            >
              <TypeIcon size={16} />
            </span>
          </ListItemMeta>
        </ListItemContent>
      </ListItem>
    </Reorder.Item>
  );
};

const WorkTree: React.FC<WorkTreeProps> = ({
  blocks,
  selectedId,
  frozen,
  loading,
  onSelect,
  onAdd,
  onReorder,
  onReorderPointerSessionChange,
}) => {
  const { t } = useTranslation("contest");
  const questions = blocks.flatMap((block) =>
    block.kind === "question" ? [block.question] : block.children,
  );
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
      hasItems={blocks.length > 0}
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
          <span>{t("examEditor.blockCount", { count: blocks.length, defaultValue: "{{count}} blocks" })}</span>
          <span>{t("examEditor.totalScore", { score: formatScore(totalScore) })}</span>
        </>
      )}
    >
      <Reorder.Group
        ref={listRef}
        axis="y"
        values={blocks}
        onReorder={onReorder}
        as="div"
        className={styles.treeListContent}
      >
        {blocks.map((block, i) => (
          <TreeItem
            key={block.id}
            block={block}
            index={i}
            isActive={selectedId === block.id}
            frozen={frozen}
            onSelect={() => onSelect(block.id)}
            onReorderPointerSessionChange={bumpReorderSession}
          />
        ))}
      </Reorder.Group>
    </WorkTreeShell>
  );
};

export default WorkTree;
