/**
 * ScorePolicyMenu — overflow menu for setting a question's score policy.
 * Renders as a small icon button with options: 不計分 / 送分 / 配分重分配 / 恢復正常計分.
 *
 * When `impactContext` is provided, a before/after score distribution preview dialog
 * is shown before committing any policy change. Otherwise falls back to a simple confirm modal.
 */
import { useState, useCallback, useRef } from "react";
import { OverflowMenu, OverflowMenuItem, Tag } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import type { ExamQuestionScorePolicy } from "@/core/entities/contest.entity";
import { setExamQuestionScorePolicy } from "@/infrastructure/api/repositories/examQuestions.repository";
import type { GradingAnswerRow, QuestionProgress } from "../gradingTypes";
import { simulateScoreImpact, type ScoreImpactResult } from "../scorePolicyImpact.utils";
import ScorePolicyModal from "./ScorePolicyModal";
import RedistributeTargetModal from "./RedistributeTargetModal";
import ScorePolicyImpactDialog from "./ScorePolicyImpactDialog";
import styles from "./ScorePolicyMenu.module.scss";

export interface ScorePolicyMenuImpactContext {
  questions: QuestionProgress[];
  studentIds: string[];
  answersByStudent: Map<string, GradingAnswerRow[]>;
}

interface ScorePolicyMenuProps {
  questionId: string;
  questionIndex: number;
  currentPolicy: ExamQuestionScorePolicy;
  /** All questions in the exam for redistribute target selection */
  allQuestions?: Array<{ id: string; order: number; prompt: string; score: number; questionType?: string; scorePolicy?: string }>;
  onPolicyChanged?: () => void;
  /** When provided, show before/after distribution preview before committing */
  impactContext?: ScorePolicyMenuImpactContext;
  /** Called when the overflow menu opens — use to trigger lazy data loading */
  onMenuOpen?: () => void;
}

export default function ScorePolicyMenu({
  questionId,
  questionIndex,
  currentPolicy,
  allQuestions = [],
  onPolicyChanged,
  impactContext,
  onMenuOpen,
}: ScorePolicyMenuProps) {
  const { t } = useTranslation("contest");
  const { contestId } = useParams<{ contestId: string }>();

  // ── Simple confirm modal (fallback when no impactContext) ──────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [targetPolicy, setTargetPolicy] = useState<ExamQuestionScorePolicy>("normal");
  const [submitting, setSubmitting] = useState(false);

  // ── Redistribute target selection modal ────────────────────────────────
  const [redistributeModalOpen, setRedistributeModalOpen] = useState(false);
  const [redistributeModalKey, setRedistributeModalKey] = useState(0);
  const pendingRedistributeTargetIds = useRef<string[]>([]);

  // ── Impact preview dialog ──────────────────────────────────────────────
  const [impactOpen, setImpactOpen] = useState(false);
  const [impactPolicy, setImpactPolicy] = useState<ExamQuestionScorePolicy>("normal");
  const [impactResult, setImpactResult] = useState<ScoreImpactResult | null>(null);

  // Available redistribute targets: only normal-policy questions (backend excludes full_marks)
  const availableTargets = allQuestions.filter(
    (q) => q.id !== questionId && (!q.scorePolicy || q.scorePolicy === "normal"),
  );

  // ── Helpers ────────────────────────────────────────────────────────────

  const computeImpact = useCallback(
    (policy: ExamQuestionScorePolicy, redistributeTargetIds: string[] = []) => {
      if (!impactContext) return null;
      return simulateScoreImpact({
        questions: impactContext.questions,
        studentIds: impactContext.studentIds,
        answersByStudent: impactContext.answersByStudent,
        targetQuestionId: questionId,
        newPolicy: policy,
        redistributeTargetIds,
      });
    },
    [impactContext, questionId],
  );

  const openImpactDialog = useCallback(
    (policy: ExamQuestionScorePolicy, redistributeTargetIds: string[] = []) => {
      setImpactPolicy(policy);
      setImpactResult(computeImpact(policy, redistributeTargetIds));
      setImpactOpen(true);
    },
    [computeImpact],
  );

  const commitPolicy = useCallback(
    async (policy: ExamQuestionScorePolicy, redistributeTargetIds?: string[]) => {
      if (!contestId) return;
      setSubmitting(true);
      try {
        await setExamQuestionScorePolicy(
          contestId,
          questionId,
          policy,
          policy === "redistribute" ? { redistribute_to: redistributeTargetIds ?? [] } : undefined,
        );
        onPolicyChanged?.();
      } catch {
        // Error handled by caller's refresh
      } finally {
        setSubmitting(false);
        setModalOpen(false);
        setImpactOpen(false);
        setRedistributeModalOpen(false);
      }
    },
    [contestId, questionId, onPolicyChanged],
  );

  // ── Menu action handler ────────────────────────────────────────────────

  const handleMenuAction = useCallback(
    (policy: ExamQuestionScorePolicy) => {
      if (policy === currentPolicy) return;

      if (policy === "redistribute") {
        // Open target selection first; impact shown after targets chosen
        pendingRedistributeTargetIds.current = [];
        setRedistributeModalKey((k) => k + 1);
        setRedistributeModalOpen(true);
        return;
      }

      if (impactContext) {
        openImpactDialog(policy);
      } else {
        setTargetPolicy(policy);
        setModalOpen(true);
      }
    },
    [currentPolicy, impactContext, openImpactDialog],
  );

  // ── Redistribute confirm: store targets then show impact ──────────────

  const handleRedistributeTargetsChosen = useCallback(
    (targetIds: string[]) => {
      pendingRedistributeTargetIds.current = targetIds;
      setRedistributeModalOpen(false);

      if (impactContext) {
        openImpactDialog("redistribute", targetIds);
      } else {
        commitPolicy("redistribute", targetIds);
      }
    },
    [impactContext, openImpactDialog, commitPolicy],
  );

  // ── Impact dialog actions ──────────────────────────────────────────────

  const handleImpactConfirm = useCallback(() => {
    if (impactPolicy === "redistribute") {
      commitPolicy("redistribute", pendingRedistributeTargetIds.current);
    } else {
      commitPolicy(impactPolicy);
    }
  }, [impactPolicy, commitPolicy]);

  const handleBackToTargetSelection = useCallback(() => {
    setImpactOpen(false);
    setRedistributeModalKey((k) => k + 1);
    setRedistributeModalOpen(true);
  }, []);

  return (
    <>
      <OverflowMenu
        size="sm"
        flipped
        iconDescription={t("grading.scorePolicy.menuTitle", "分數政策")}
        className={styles.menu}
        aria-label={t("grading.scorePolicy.menuTitle", "分數政策")}
        onClick={onMenuOpen}
      >
        <OverflowMenuItem
          itemText={
            currentPolicy === "excluded"
              ? `✓  ${t("grading.scorePolicy.excluded", "不計分")}`
              : t("grading.scorePolicy.setExcluded", "設為不計分")
          }
          onClick={() => handleMenuAction("excluded")}
          disabled={currentPolicy === "excluded"}
        />
        <OverflowMenuItem
          itemText={
            currentPolicy === "full_marks"
              ? `✓  ${t("grading.scorePolicy.fullMarks", "送分")}`
              : t("grading.scorePolicy.setFullMarks", "設為送分")
          }
          onClick={() => handleMenuAction("full_marks")}
          disabled={currentPolicy === "full_marks"}
        />
        <OverflowMenuItem
          itemText={
            currentPolicy === "redistribute"
              ? `✓  ${t("grading.scorePolicy.redistribute", "配分重分配")}`
              : t("grading.scorePolicy.setRedistribute", "設為配分重分配")
          }
          onClick={() => handleMenuAction("redistribute")}
          disabled={currentPolicy === "redistribute"}
        />
        {currentPolicy !== "normal" && (
          <OverflowMenuItem
            itemText={t("grading.scorePolicy.setNormal", "恢復正常計分")}
            onClick={() => handleMenuAction("normal")}
            hasDivider
          />
        )}
      </OverflowMenu>

      {/* Fallback simple confirm — used when impactContext is absent */}
      <ScorePolicyModal
        open={modalOpen}
        targetPolicy={targetPolicy}
        questionIndex={questionIndex}
        onClose={() => setModalOpen(false)}
        onConfirm={() => commitPolicy(targetPolicy)}
        submitting={submitting}
      />

      {/* Redistribute target selection */}
      <RedistributeTargetModal
        key={redistributeModalKey}
        open={redistributeModalOpen}
        questionIndex={questionIndex}
        availableTargets={availableTargets}
        initialSelectedIds={pendingRedistributeTargetIds.current}
        onClose={() => setRedistributeModalOpen(false)}
        onConfirm={handleRedistributeTargetsChosen}
        submitting={submitting}
      />

      {/* Before/after impact preview (only when impactContext provided) */}
      {impactContext && (
        <ScorePolicyImpactDialog
          open={impactOpen}
          newPolicy={impactPolicy}
          impactResult={impactResult}
          submitting={submitting}
          onClose={() => setImpactOpen(false)}
          onConfirm={handleImpactConfirm}
          onBackToTargetSelection={
            impactPolicy === "redistribute" ? handleBackToTargetSelection : undefined
          }
        />
      )}
    </>
  );
}

/** Small inline tag showing current score policy status. */
export function ScorePolicyTag({
  policy,
}: {
  policy: ExamQuestionScorePolicy;
}) {
  const { t } = useTranslation("contest");

  if (policy === "normal") return null;

  const config: Record<string, { type: "red" | "green" | "blue"; label: string }> = {
    excluded: { type: "red", label: t("grading.scorePolicy.excluded", "不計分") },
    full_marks: { type: "green", label: t("grading.scorePolicy.fullMarks", "送分") },
    redistribute: { type: "blue", label: t("grading.scorePolicy.redistribute", "配分重分配") },
  };

  const entry = config[policy];
  if (!entry) return null;
  return (
    <Tag type={entry.type} size="sm" className={styles.tag}>
      {entry.label}
    </Tag>
  );
}
