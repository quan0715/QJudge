import React from "react";
import { Button, IconButton, Tag } from "@carbon/react";
import { Add, Draggable, TrashCan } from "@carbon/icons-react";
import { Reorder, useDragControls } from "motion/react";
import type { ContestProblemSummary } from "@/core/entities/contest.entity";
import styles from "./WorkTree.module.scss";
import WorkTreeShell from "./WorkTreeShell";

const DIFFICULTY_TAG: Record<string, { label: string; color: string }> = {
  easy: { label: "Easy", color: "green" },
  medium: { label: "Medium", color: "blue" },
  hard: { label: "Hard", color: "red" },
};

interface ProblemWorkTreeProps {
  problems: ContestProblemSummary[];
  selectedId: string | null;
  loading?: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onReorder: (reordered: ContestProblemSummary[]) => void;
}

const ProblemTreeItem: React.FC<{
  problem: ContestProblemSummary;
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
}> = ({ problem, isActive, onSelect, onRemove }) => {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={problem}
      dragListener={false}
      dragControls={dragControls}
      as="div"
      className={`${styles.treeItem} ${isActive ? styles.treeItemActive : ""}`}
    >
      <div
        className={styles.dragHandle}
        onPointerDown={(e) => dragControls.start(e)}
      >
        <Draggable size={14} />
      </div>
      <button
        type="button"
        className={styles.itemButton}
        onClick={onSelect}
      >
        <span className={styles.itemOrder}>{problem.label}</span>
        <div className={styles.itemInfo}>
          <span className={styles.itemTitle}>{problem.title}</span>
          <div className={styles.itemMeta}>
            {problem.difficulty && DIFFICULTY_TAG[problem.difficulty] && (
              <Tag
                type={DIFFICULTY_TAG[problem.difficulty].color as never}
                size="sm"
              >
                {DIFFICULTY_TAG[problem.difficulty].label}
              </Tag>
            )}
            {problem.score != null && (
              <span className={styles.itemScore}>{problem.score}pt</span>
            )}
          </div>
        </div>
      </button>
      <div className={styles.deleteBtn}>
        <IconButton
          kind="ghost"
          size="sm"
          label="移除"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <TrashCan size={14} />
        </IconButton>
      </div>
    </Reorder.Item>
  );
};

const ProblemWorkTree: React.FC<ProblemWorkTreeProps> = ({
  problems,
  selectedId,
  loading,
  onSelect,
  onAdd,
  onRemove,
  onReorder,
}) => {
  const totalScore = problems.reduce((sum, problem) => sum + (problem.score ?? 0), 0);

  return (
    <WorkTreeShell
      title="Problem List"
      actions={(
        <Button
          kind="ghost"
          renderIcon={Add}
          hasIconOnly
          iconDescription="Add Problem"
          onClick={onAdd}
        />
      )}
      hasItems={problems.length > 0}
      loading={loading}
      emptyState={(
        <>
          <p>No problems yet</p>
          <Button kind="tertiary" size="sm" renderIcon={Add} onClick={onAdd}>
            Add First Problem
          </Button>
        </>
      )}
      footer={(
        <>
          <span>{problems.length} problems</span>
          <span>Total {totalScore}pt</span>
        </>
      )}
    >
      <Reorder.Group
        axis="y"
        values={problems}
        onReorder={onReorder}
        as="div"
        className={styles.treeListContent}
      >
        {problems.map((p) => (
          <ProblemTreeItem
            key={p.id}
            problem={p}
            isActive={selectedId === p.id}
            onSelect={() => onSelect(p.id)}
            onRemove={() => onRemove(p.id)}
          />
        ))}
      </Reorder.Group>
    </WorkTreeShell>
  );
};

export default ProblemWorkTree;
