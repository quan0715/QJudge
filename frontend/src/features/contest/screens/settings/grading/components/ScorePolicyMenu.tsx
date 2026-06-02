/**
 * ScorePolicyMenu — overflow menu for setting a question's score policy.
 * Renders as a small icon button with options: 不計分 / 送分 / 配分重分配 / 恢復正常計分.
 */
import { useState, useCallback } from "react";
import { OverflowMenu, OverflowMenuItem, Tag } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import type { ExamQuestionScorePolicy } from "@/core/entities/contest.entity";
import { setExamQuestionScorePolicy } from "@/infrastructure/api/repositories/examQuestions.repository";
import ScorePolicyModal from "./ScorePolicyModal";
import RedistributeTargetModal from "./RedistributeTargetModal";
import styles from "./ScorePolicyMenu.module.scss";

interface ScorePolicyMenuProps {
  questionId: string;
  questionIndex: number;
  currentPolicy: ExamQuestionScorePolicy;
  /** All questions in the exam for redistribute target selection */
  allQuestions?: Array<{ id: string; order: number; prompt: string; score: number }>;
  onPolicyChanged?: () => void;
}

export default function ScorePolicyMenu({
  questionId,
  questionIndex,
  currentPolicy,
  allQuestions = [],
  onPolicyChanged,
}: ScorePolicyMenuProps) {
  const { t } = useTranslation("contest");
  const { contestId } = useParams<{ contestId: string }>();
  const [modalOpen, setModalOpen] = useState(false);
  const [redistributeModalOpen, setRedistributeModalOpen] = useState(false);
  const [targetPolicy, setTargetPolicy] = useState<ExamQuestionScorePolicy>("normal");
  const [submitting, setSubmitting] = useState(false);

  const handleMenuAction = useCallback((policy: ExamQuestionScorePolicy) => {
    if (policy === currentPolicy) return;
    if (policy === "redistribute") {
      setRedistributeModalOpen(true);
      return;
    }
    setTargetPolicy(policy);
    setModalOpen(true);
  }, [currentPolicy]);

  const handleConfirm = useCallback(async () => {
    if (!contestId) return;
    setSubmitting(true);
    try {
      await setExamQuestionScorePolicy(contestId, questionId, targetPolicy);
      onPolicyChanged?.();
    } catch {
      // Error is handled by the caller's refresh
    } finally {
      setSubmitting(false);
      setModalOpen(false);
    }
  }, [contestId, questionId, targetPolicy, onPolicyChanged]);

  const handleRedistributeConfirm = useCallback(async (targetIds: string[]) => {
    if (!contestId) return;
    setSubmitting(true);
    try {
      await setExamQuestionScorePolicy(contestId, questionId, "redistribute", {
        redistribute_to: targetIds,
      });
      onPolicyChanged?.();
    } catch {
      // Error is handled by the caller's refresh
    } finally {
      setSubmitting(false);
      setRedistributeModalOpen(false);
    }
  }, [contestId, questionId, onPolicyChanged]);

  // Available target questions: exclude current question and any already-excluded/redistribute ones
  const availableTargets = allQuestions.filter(
    (q) => q.id !== questionId
  );

  return (
    <>
      <OverflowMenu
        size="sm"
        flipped
        iconDescription={t("grading.scorePolicy.menuTitle", "分數政策")}
        className={styles.menu}
        aria-label={t("grading.scorePolicy.menuTitle", "分數政策")}
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

      <ScorePolicyModal
        open={modalOpen}
        targetPolicy={targetPolicy}
        questionIndex={questionIndex}
        onClose={() => setModalOpen(false)}
        onConfirm={handleConfirm}
        submitting={submitting}
      />

      <RedistributeTargetModal
        open={redistributeModalOpen}
        questionIndex={questionIndex}
        availableTargets={availableTargets}
        onClose={() => setRedistributeModalOpen(false)}
        onConfirm={handleRedistributeConfirm}
        submitting={submitting}
      />
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
