import { Modal } from "@carbon/react";
import {
  CheckmarkFilled,
  CircleDash,
  WarningAlt,
  Renew,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ExamSubmissionProgressState } from "@/features/contest/hooks/useExamSubmissionProgress";
import styles from "./ExamSubmissionProgressModal.module.scss";

interface ExamSubmissionProgressModalProps {
  state: ExamSubmissionProgressState;
  onRequestClose?: () => void;
}

export default function ExamSubmissionProgressModal({
  state,
  onRequestClose,
}: ExamSubmissionProgressModalProps) {
  const { t } = useTranslation("contest");

  return (
    <Modal
      open={state.open}
      passiveModal
      modalHeading={t("exam.submitProgress.title", "正在處理交卷")}
      onRequestClose={() => {
        if (state.running) return;
        onRequestClose?.();
      }}
      preventCloseOnClickOutside
      size="sm"
    >
      <ul className={styles.stepList}>
        {state.steps.map((step) => {
          const icon =
            step.status === "done" ? (
              <CheckmarkFilled size={16} />
            ) : step.status === "active" ? (
              <Renew size={16} className={styles.spinning} />
            ) : step.status === "error" ? (
              <WarningAlt size={16} />
            ) : (
              <CircleDash size={16} />
            );
          const statusClass =
            step.status === "done"
              ? styles.stepDone
              : step.status === "active"
                ? styles.stepActive
                : step.status === "error"
                  ? styles.stepError
                  : "";

          return (
            <li key={step.id} className={`${styles.stepItem} ${statusClass}`}>
              {icon}
              <span className={styles.stepLabel}>{step.label}</span>
            </li>
          );
        })}
      </ul>

      {state.errorMessage ? (
        <div className={styles.errorText}>{state.errorMessage}</div>
      ) : (
        <div className={styles.hintText}>
          {t("exam.submitProgress.hint", "請勿關閉此視窗，系統正在完成交卷流程。")}
        </div>
      )}
    </Modal>
  );
}
