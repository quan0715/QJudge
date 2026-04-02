import React from "react";
import { useState } from "react";
import { Button, IconButton, Tag, TextInput } from "@carbon/react";
import { Add, Catalog, Draggable, TrashCan } from "@carbon/icons-react";
import { Reorder, useDragControls } from "motion/react";
import type { ContestProblemSummary } from "@/core/entities/contest.entity";
import { SaveToBankModal } from "@/features/question-banks/components/SaveToBankModal";
import AddQuestionMenuButton from "./AddQuestionMenuButton";
import styles from "./WorkTree.module.scss";
import WorkTreeShell from "./WorkTreeShell";

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

const getSourceModeLabel = (mode?: ContestProblemSummary["sourceMode"]): string | null => {
  if (mode === "copy") return "Copied";
  if (mode === "reference") return "Reference";
  return null;
};

const isAlreadyInQuestionBank = (problem: ContestProblemSummary): boolean =>
  !!problem.sourceBank || problem.sourceMode === "copy" || problem.sourceMode === "reference";

interface ProblemWorkTreeProps {
  problems: ContestProblemSummary[];
  selectedId: string | null;
  questionEditLocked?: boolean;
  lockedReason?: string;
  loading?: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onImportFromBank?: () => void;
  onRemove: (id: string) => void;
  onReorder: (reordered: ContestProblemSummary[]) => void;
  onUpdateScore?: (id: string, maxScore: number) => Promise<void> | void;
  externalCanDrop?: boolean;
  externalHoverIndex?: number | null;
  onExternalHoverIndexChange?: (index: number | null) => void;
  onExternalDropAt?: (index: number) => Promise<void> | void;
}

const ProblemTreeItem: React.FC<{
  problem: ContestProblemSummary;
  isActive: boolean;
  locked?: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onUpdateScore?: (id: string, maxScore: number) => Promise<void> | void;
}> = ({ problem, isActive, locked, onSelect, onRemove, onUpdateScore }) => {
  const dragControls = useDragControls();
  const initialScore = Math.max(1, Number(problem.maxScore ?? problem.score ?? 100));
  const [scoreDraft, setScoreDraft] = React.useState<string>(String(initialScore));
  const [saveToBankOpen, setSaveToBankOpen] = useState(false);
  const saveToBankDisabled = !!locked || isAlreadyInQuestionBank(problem);
  const saveToBankLabel = locked
    ? "已有學生正式作答，題目已鎖定"
    : isAlreadyInQuestionBank(problem)
      ? "此題已收錄至題庫"
      : "收錄到題庫";

  React.useEffect(() => {
    setScoreDraft(String(Math.max(1, Number(problem.maxScore ?? problem.score ?? 100))));
  }, [problem.maxScore, problem.score]);

  const commitScore = async () => {
    if (!onUpdateScore) return;
    const parsed = Number(scoreDraft);
    const normalized = Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : initialScore;
    if (normalized !== initialScore) {
      await onUpdateScore(problem.id, normalized);
    } else if (scoreDraft !== String(initialScore)) {
      setScoreDraft(String(initialScore));
    }
  };

  return (
    <Reorder.Item
      value={problem}
      dragListener={false}
      dragControls={dragControls}
      drag={!locked}
      as="div"
      data-problem-id={problem.id}
      className={`${styles.treeItem} ${isActive ? styles.treeItemActive : ""}`}
    >
      {!locked && (
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
        <span className={styles.itemOrder}>{problem.label}</span>
        <div className={styles.itemInfo}>
          <span className={styles.itemTitle}>{getProblemDisplayTitle(problem)}</span>
          <div className={styles.itemMeta}>
            {problem.difficulty && DIFFICULTY_TAG[problem.difficulty] && (
              <Tag
                type={DIFFICULTY_TAG[problem.difficulty].color as never}
                size="sm"
              >
                {DIFFICULTY_TAG[problem.difficulty].label}
              </Tag>
            )}
            {problem.maxScore != null && (
              <span className={styles.itemScore}>{problem.maxScore} pt</span>
            )}
          </div>
          <div className={styles.itemSubMeta}>
            {problem.sourceBank?.name && (
              <span>{problem.sourceBank.name}</span>
            )}
            {getSourceModeLabel(problem.sourceMode) && (
              <span>
                {problem.sourceBank?.name ? " · " : ""}
                {getSourceModeLabel(problem.sourceMode)}
              </span>
            )}
          </div>
        </div>
      </button>
      <div className={styles.scoreEditor}>
        <TextInput
          id={`problem-score-${problem.id}`}
          hideLabel
          labelText="Score"
          value={scoreDraft}
          type="number"
          min={1}
          size="sm"
          disabled={locked}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setScoreDraft(e.target.value)}
          onBlur={() => {
            void commitScore();
          }}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
        />
      </div>
      <div className={styles.deleteBtn}>
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
        <IconButton
          kind="ghost"
          size="sm"
          label="移除"
          disabled={locked}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <TrashCan size={14} />
        </IconButton>
      </div>
      <SaveToBankModal
        open={saveToBankOpen}
        onClose={() => setSaveToBankOpen(false)}
        sourceType="problem"
        sourceId={problem.problemId}
        sourceTitle={getProblemDisplayTitle(problem)}
      />
    </Reorder.Item>
  );
};

const ProblemWorkTree: React.FC<ProblemWorkTreeProps> = ({
  problems,
  selectedId,
  questionEditLocked,
  lockedReason,
  loading,
  onSelect,
  onAdd,
  onImportFromBank,
  onRemove,
  onReorder,
  onUpdateScore,
  externalCanDrop = false,
  externalHoverIndex = null,
  onExternalHoverIndexChange,
  onExternalDropAt,
}) => {
  const listRef = React.useRef<HTMLDivElement>(null);
  const totalScore = problems.reduce((sum, problem) => sum + (problem.maxScore ?? problem.score ?? 0), 0);

  React.useEffect(() => {
    if (!selectedId || !listRef.current) return;
    const activeEl = listRef.current.querySelector(`[data-problem-id="${selectedId}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedId]);

  const renderDropSlot = (index: number) => {
    if (!externalCanDrop) {
      return <div key={`drop-slot-${index}`} className={styles.externalDropSlotIdle} />;
    }

    return (
      <div
        key={`drop-slot-${index}`}
        className={`${styles.externalDropSlot} ${
          externalHoverIndex === index ? styles.externalDropSlotActive : ""
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          onExternalHoverIndexChange?.(index);
        }}
        onDragLeave={() => {
          if (externalHoverIndex === index) {
            onExternalHoverIndexChange?.(null);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          onExternalHoverIndexChange?.(null);
          void onExternalDropAt?.(index);
        }}
      />
    );
  };

  return (
    <WorkTreeShell
      title="Problem List"
      actions={
        <>
          <AddQuestionMenuButton
            onCreate={onAdd}
            onImportFromBank={onImportFromBank}
            disabled={!!questionEditLocked}
          />
        </>
      }
      hasItems={problems.length > 0}
      loading={loading}
      emptyState={(
        <>
          <p>No problems yet</p>
          <Button
            kind="tertiary"
            size="sm"
            renderIcon={Add}
            onClick={onAdd}
            disabled={!!questionEditLocked}
          >
            Add First Problem
          </Button>
        </>
      )}
      footer={(
        <>
          <span>{problems.length} problems</span>
          <span>Total {totalScore}pt</span>
          {questionEditLocked && lockedReason && <span>{lockedReason}</span>}
        </>
      )}
    >
      <Reorder.Group
        ref={listRef}
        axis="y"
        values={problems}
        onReorder={onReorder}
        as="div"
        className={styles.treeListContent}
      >
        {problems.map((problem, index) => (
          <React.Fragment key={problem.id}>
            {renderDropSlot(index)}
            <ProblemTreeItem
              problem={problem}
              isActive={selectedId === problem.id}
              locked={questionEditLocked}
              onSelect={() => onSelect(problem.id)}
              onRemove={() => onRemove(problem.id)}
              onUpdateScore={onUpdateScore}
            />
          </React.Fragment>
        ))}
        {renderDropSlot(problems.length)}
      </Reorder.Group>
    </WorkTreeShell>
  );
};

export default ProblemWorkTree;
