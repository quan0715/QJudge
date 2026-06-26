import React from "react";
import { Tag } from "@carbon/react";
import { Draggable } from "@carbon/icons-react";
import { Reorder, useDragControls } from "motion/react";
import { useTranslation } from "react-i18next";
import type { ContestProblemSummary } from "@/core/entities/contest.entity";
import {
  ListItem,
  ListItemLeading,
  ListItemContent,
  ListItemTitle,
  ListItemMeta,
} from "@/shared/ui/list/ListPanel";
import { attachReorderPointerSession } from "@/shared/ui/cardListEditor";
import { formatScore } from "@/shared/utils/scoreFormat";
import WorkTreeShell from "./WorkTreeShell";
import treeStyles from "./WorkTree.module.scss";
import { labelForContestProblemOrder } from "@/features/contest/domain/contestProblemOrderLabel";
import { CODING_PROBLEM_DIFFICULTY_TAG } from "./codingProblemDifficultyDisplay";

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
  onReorderPointerSessionChange?: (delta: 1 | -1) => void;
}

/** Row chrome aligned with paper exam `WorkTree` (order + title + meta Tag). */
const ProblemTreeItem: React.FC<{
  problem: ContestProblemSummary;
  index: number;
  isActive: boolean;
  locked?: boolean;
  onSelect: () => void;
  onReorderPointerSessionChange?: (delta: 1 | -1) => void;
}> = ({ problem, index, isActive, locked, onSelect, onReorderPointerSessionChange }) => {
  const dragControls = useDragControls();
  const titleText = getProblemDisplayTitle(problem);

  return (
    <Reorder.Item
      value={problem}
      dragListener={false}
      dragControls={dragControls}
      drag={!locked}
      as="div"
      data-problem-id={problem.id}
    >
      <ListItem active={isActive} onClick={onSelect}>
        <ListItemLeading>
          {!locked && (
            <div
              className={treeStyles.dragHandle}
              data-testid={`coding-sidebar-drag-${problem.id}`}
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
          <span className={treeStyles.itemOrder}>
            {problem.label || labelForContestProblemOrder(index)}
          </span>
        </ListItemLeading>
        <ListItemContent>
          <ListItemTitle>{titleText}</ListItemTitle>
          <ListItemMeta>
            {problem.difficulty && CODING_PROBLEM_DIFFICULTY_TAG[problem.difficulty] ? (
              <Tag
                type={CODING_PROBLEM_DIFFICULTY_TAG[problem.difficulty].color as never}
                size="sm"
              >
                {CODING_PROBLEM_DIFFICULTY_TAG[problem.difficulty].label}
              </Tag>
            ) : null}
          </ListItemMeta>
        </ListItemContent>
      </ListItem>
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
  onReorderPointerSessionChange,
}) => {
  const { t } = useTranslation("contest");
  const listRef = React.useRef<HTMLDivElement>(null);
  const reorderDragDepthRef = React.useRef(0);

  const bumpReorderSession = React.useCallback(
    (delta: 1 | -1) => {
      reorderDragDepthRef.current = Math.max(0, reorderDragDepthRef.current + delta);
      onReorderPointerSessionChange?.(delta);
    },
    [onReorderPointerSessionChange],
  );

  const totalScore = problems.reduce(
    (sum, p) => sum + (p.maxScore ?? p.score ?? 0),
    0,
  );

  React.useEffect(() => {
    if (!selectedId || !listRef.current) return;
    if (reorderDragDepthRef.current > 0) return;
    const el = listRef.current.querySelector(`[data-problem-id="${selectedId}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedId]);

  return (
    <WorkTreeShell
      title={t("examEditor.questionList", "題目列表")}
      hasItems={problems.length > 0}
      loading={loading}
      emptyState={(
        <>
          <p>{t("examEditor.noQuestions", "尚無題目")}</p>
        </>
      )}
      footer={(
        <>
          <span>{t("examEditor.questionCount", { count: problems.length })}</span>
          <span>{t("examEditor.totalScore", { score: formatScore(totalScore) })}</span>
        </>
      )}
    >
      <Reorder.Group
        ref={listRef}
        axis="y"
        values={problems}
        onReorder={onReorder}
        as="div"
        className={treeStyles.treeListContent}
      >
        {problems.map((problem, index) => (
          <ProblemTreeItem
            key={problem.id}
            problem={problem}
            index={index}
            isActive={selectedId === problem.id}
            locked={locked}
            onSelect={() => onSelect(problem.id)}
            onReorderPointerSessionChange={bumpReorderSession}
          />
        ))}
      </Reorder.Group>
    </WorkTreeShell>
  );
};

export default CodingProblemListPanel;
