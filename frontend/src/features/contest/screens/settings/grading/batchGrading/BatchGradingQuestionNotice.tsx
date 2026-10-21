import { ActionableNotification, InlineNotification } from "@carbon/react";
import { useTranslation } from "react-i18next";
import type { BatchQuestionState } from "./batchGradingModel";
import styles from "./BatchGrading.module.scss";

interface BatchGradingQuestionNoticeProps {
  state: BatchQuestionState;
  onResume(): void;
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
  if (state.status === "failed" || state.status === "paused") {
    return (
      <ActionableNotification
        className={styles.notice}
        kind="error"
        lowContrast
        inline
        hideCloseButton
        title={t("grading.batch.noticeFailed", { error: state.error ?? "" })}
        subtitle={state.error}
        actionButtonLabel={t("grading.batch.fill", { count: state.ungradedCount })}
        onActionButtonClick={onResume}
      />
    );
  }
  return null;
}
