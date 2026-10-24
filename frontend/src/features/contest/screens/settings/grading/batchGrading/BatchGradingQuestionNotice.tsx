import { ActionableNotification, InlineNotification } from "@carbon/react";
import { useTranslation } from "react-i18next";
import {
  FINALIZE_TIMEOUT_ERROR,
  isUnfinished,
  type BatchQuestionState,
} from "./batchGradingModel";
import styles from "./BatchGrading.module.scss";

interface BatchGradingQuestionNoticeProps {
  state: BatchQuestionState;
  /** Offer to grade what is left. Without it, failures show only their reason and stopped runs no reminder. */
  onResume?(): void;
}

export function BatchGradingQuestionNotice({ state, onResume }: BatchGradingQuestionNoticeProps) {
  const { t } = useTranslation("contest");

  if (state.status === "queued" || state.status === "running") {
    return (
      <InlineNotification
        className={styles.notice}
        kind="info"
        lowContrast
        hideCloseButton
        title={t("grading.batch.noticeRunning")}
      />
    );
  }
  if (state.status === "awaiting-approval") {
    return (
      <InlineNotification
        className={styles.notice}
        kind="warning"
        lowContrast
        hideCloseButton
        title={t("grading.batch.noticeAwaitingApproval")}
      />
    );
  }
  const errorText =
    state.error === FINALIZE_TIMEOUT_ERROR ? t("grading.batch.finalizeTimeout") : state.error;
  if ((state.status === "failed" || state.status === "paused") && !onResume) {
    return (
      <InlineNotification
        className={styles.notice}
        kind="error"
        lowContrast
        hideCloseButton
        title={t("grading.batch.noticeFailed")}
        subtitle={errorText}
      />
    );
  }
  if (state.status === "failed" || state.status === "paused") {
    return (
      <ActionableNotification
        className={styles.notice}
        kind="error"
        lowContrast
        inline
        hideCloseButton
        title={t("grading.batch.noticeFailed")}
        subtitle={errorText}
        actionButtonLabel={t("grading.batch.fill", { count: state.ungradedCount })}
        onActionButtonClick={onResume}
      />
    );
  }
  if (isUnfinished(state) && onResume) {
    return (
      <ActionableNotification
        className={styles.notice}
        kind="warning"
        lowContrast
        inline
        hideCloseButton
        title={
          state.status === "completed"
            ? t("grading.batch.noticeIncomplete", { count: state.ungradedCount })
            : t("grading.batch.noticeStopped", { count: state.ungradedCount })
        }
        subtitle={errorText}
        actionButtonLabel={t("grading.batch.fill", { count: state.ungradedCount })}
        onActionButtonClick={onResume}
      />
    );
  }
  if (state.skippedAtWriteCount) {
    return (
      <InlineNotification
        className={styles.notice}
        kind="info"
        lowContrast
        hideCloseButton
        title={t("grading.batch.noticeSkippedAtWrite", { count: state.skippedAtWriteCount })}
      />
    );
  }
  return null;
}
