/**
 * ScorePolicyModal — confirmation modal for changing a question's score policy.
 */
import { Modal } from "@carbon/react";
import { useTranslation } from "react-i18next";
import type { ExamQuestionScorePolicy } from "@/core/entities/contest.entity";

interface ScorePolicyModalProps {
  open: boolean;
  targetPolicy: ExamQuestionScorePolicy;
  questionIndex: number;
  onClose: () => void;
  onConfirm: () => void;
  submitting?: boolean;
}

export default function ScorePolicyModal({
  open,
  targetPolicy,
  questionIndex,
  onClose,
  onConfirm,
  submitting = false,
}: ScorePolicyModalProps) {
  const { t } = useTranslation("contest");

  const headingMap: Record<ExamQuestionScorePolicy, string> = {
    excluded: t("grading.scorePolicy.setExcluded", "設為不計分"),
    full_marks: t("grading.scorePolicy.setFullMarks", "設為送分"),
    redistribute: t("grading.scorePolicy.setRedistribute", "設為配分重分配"),
    normal: t("grading.scorePolicy.setNormal", "恢復正常計分"),
  };

  const bodyMap: Record<ExamQuestionScorePolicy, string> = {
    excluded: t("grading.scorePolicy.confirmExcluded", {
      index: questionIndex,
      defaultValue: "確定要將第 {{index}} 題設為不計分？所有學生的此題成績將不計入總分。",
    }),
    full_marks: t("grading.scorePolicy.confirmFullMarks", {
      index: questionIndex,
      defaultValue: "確定要將第 {{index}} 題設為送分？所有學生將獲得此題滿分。",
    }),
    redistribute: t("grading.scorePolicy.confirmRedistribute", {
      index: questionIndex,
      defaultValue: "確定要將第 {{index}} 題設為配分重分配？此題分數將按比例分配至指定題目。",
    }),
    normal: t("grading.scorePolicy.confirmNormal", {
      index: questionIndex,
      defaultValue: "確定要將第 {{index}} 題恢復為正常計分？",
    }),
  };

  return (
    <Modal
      open={open}
      modalHeading={headingMap[targetPolicy]}
      primaryButtonText={t("common.confirm", "確認")}
      secondaryButtonText={t("common.cancel", "取消")}
      onRequestClose={onClose}
      onRequestSubmit={onConfirm}
      primaryButtonDisabled={submitting}
      danger={targetPolicy === "excluded"}
      size="sm"
    >
      <p style={{ marginBottom: "1rem" }}>{bodyMap[targetPolicy]}</p>
    </Modal>
  );
}
