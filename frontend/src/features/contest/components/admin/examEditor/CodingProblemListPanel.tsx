import React from "react";
import { Tag } from "@carbon/react";
import { Draggable } from "@carbon/icons-react";
import { SkeletonPlaceholder } from "@carbon/react";
import { Reorder, useDragControls } from "motion/react";
import type { ContestProblemSummary } from "@/core/entities/contest.entity";
import {
  ListPanel,
  ListHeader,
  ListFooter,
} from "@/shared/ui/list/ListPanel";
import styles from "./CodingProblemListPanel.module.scss";
import treeStyles from "./WorkTree.module.scss";

const DIFFICULTY_TAG: Record<string, { label: string; color: string }> = {
  easy: { label: "Easy", color: "green" },
  medium: { label: "Medium", color: "blue" },
  hard: { label: "Hard", color: "red" },
};

const PLACEHOLDER_PROBLEM_TITLE = /^test\s*-\s*q\d+$/i;

const getProblemDisplayTitle = (problem: ContestProblemSummary): string => {
  const rawTitle = (problem.title || "").trim();
  if (rawTitle.length > 0 && !PLACEHOLDER_PROBLEM_TITLE.test(rawTitle)) {
    return rawTitle;
  }
  return problem.label ? `Problem ${problem.label}` : "Untitled Problem";
};

interface CodingProblemListPanelProps {
  problems: ContestProblemSummary[];
  selectedId: string | null;
  locked?: boolean;
  loading?: boolean;
  onSelect: (id: string) => void;
  onReorder: (reordered: ContestProblemSummary[]) => void;
}

const ProblemReorderItem: React.FC<{
  problem: ContestProblemSummary;
  isActive: boolean;
  locked?: boolean;
  onSelect: () => void;
}> = ({ problem, isActive, locked, onSelect }) => {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={problem}
      dragListener={false}
      dragControls={dragControls}
      drag={!locked}
      layout
      as="div"
      data-problem-id={problem.id}
      className={`${styles.item} ${isActive ? styles.itemActive : ""}`}
    >
      {!locked && (
        <div
          className={styles.dragHandle}
          onPointerDown={(e) => dragControls.start(e)}
        >
          <Draggable size={14} />
        </div>
      )}
      <button type="button" className={styles.itemButton} onClick={onSelect}>
        <span className={styles.label}>{problem.label}</span>
        <div className={styles.content}>
          <span className={styles.title}>{getProblemDisplayTitle(problem)}</span>
          <div className={styles.meta}>
            {problem.difficulty && DIFFICULTY_TAG[problem.difficulty] && (
              <Tag
                type={DIFFICULTY_TAG[problem.difficulty].color as never}
                size="sm"
              >
                {DIFFICULTY_TAG[problem.difficulty].label}
              </Tag>
            )}
            {problem.maxScore != null && (
              <span className={styles.score}>{problem.maxScore} pt</span>
            )}
          </div>
        </div>
      </button>
    </Reorder.Item>
  );
};

const CodingProblemListPanel: React.FC<CodingProblemListPanelProps> = ({
  problems,
  selectedId,
  locked = false,
  loading = false,
  onSelect,
  onReorder,
}) => {
  const listRef = React.useRef<HTMLDivElement>(null);
  const totalScore = problems.reduce(
    (sum, p) => sum + (p.maxScore ?? p.score ?? 0),
    0,
  );

  React.useEffect(() => {
    if (!selectedId || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-problem-id="${selectedId}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedId]);

  return (
    <ListPanel
      header={<ListHeader title="Problem List" />}
      footer={
        <ListFooter>
          <span>{problems.length} problems</span>
          <span>Total {totalScore}pt</span>
        </ListFooter>
      }
    >
      {loading ? (
        <div className={treeStyles.skeletonList}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={treeStyles.skeletonItem}>
              <SkeletonPlaceholder className={treeStyles.skeletonOrder} />
              <div className={treeStyles.skeletonContent}>
                <SkeletonPlaceholder className={treeStyles.skeletonTitle} />
                <SkeletonPlaceholder className={treeStyles.skeletonMeta} />
              </div>
            </div>
          ))}
        </div>
      ) : problems.length === 0 ? (
        <div className={treeStyles.emptyState}>
          <p>No problems yet</p>
        </div>
      ) : (
        <Reorder.Group
          ref={listRef}
          axis="y"
          values={problems}
          onReorder={onReorder}
          as="div"
          className={styles.list}
        >
          {problems.map((problem) => (
            <ProblemReorderItem
              key={problem.id}
              problem={problem}
              isActive={selectedId === problem.id}
              locked={locked}
              onSelect={() => onSelect(problem.id)}
            />
          ))}
        </Reorder.Group>
      )}
    </ListPanel>
  );
};

export default CodingProblemListPanel;
