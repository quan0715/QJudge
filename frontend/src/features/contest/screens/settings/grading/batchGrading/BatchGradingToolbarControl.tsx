import { Button, InlineNotification, ProgressBar, Tag } from "@carbon/react";
import { Renew, StopFilled, MachineLearningModel } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { isUnfinished } from "./batchGradingModel";
import type { UseBatchGradingResult } from "./useBatchGrading";
import styles from "./BatchGrading.module.scss";

interface BatchGradingToolbarControlProps {
  batch: UseBatchGradingResult;
  resultsPublished: boolean;
  onRequestStart(): void;
}

export function BatchGradingToolbarControl(props: BatchGradingToolbarControlProps) {
  const { batch } = props;
  return (
    <div className={styles.control}>
      <BatchGradingToolbarActions {...props} />
      {batch.error && (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title={batch.error}
          className={styles.toolbarError}
        />
      )}
    </div>
  );
}

function BatchGradingToolbarActions({
  batch,
  resultsPublished,
  onRequestStart,
}: BatchGradingToolbarControlProps) {
  const { t } = useTranslation("contest");
  const beta = (
    <Tag type="purple" size="sm">
      {t("grading.batch.beta")}
    </Tag>
  );

  if (!batch.sessionId) {
    return (
      <div className={styles.control}>
        <Button
          kind="tertiary"
          size="sm"
          renderIcon={MachineLearningModel}
          disabled={!batch.canStart || batch.busy}
          onClick={onRequestStart}
        >
          {t("grading.batch.start")}
        </Button>
        {beta}
        {resultsPublished && <span className={styles.helper}>{t("grading.batch.publishedDisabled")}</span>}
      </div>
    );
  }

  const { overall } = batch;
  if (overall.running) {
    return (
      <div className={styles.control}>
        {beta}
        <div className={styles.progress}>
          <span className={styles.progressText}>
            {t("grading.batch.progress", {
              done: overall.done,
              total: overall.total,
              written: overall.writtenCount,
            })}
          </span>
          <ProgressBar
            size="small"
            hideLabel
            label={t("grading.batch.start")}
            value={overall.done}
            max={Math.max(overall.total, 1)}
          />
        </div>
        <Button
          kind="danger--ghost"
          size="sm"
          renderIcon={StopFilled}
          disabled={batch.busy}
          onClick={() => void batch.stop()}
        >
          {t("grading.batch.stop")}
        </Button>
      </div>
    );
  }

  const unfinished = batch.questions.filter(isUnfinished);
  const remaining = unfinished.reduce((sum, q) => sum + q.ungradedCount, 0);
  const interrupted = unfinished.some((q) => q.status === "cancelled" || q.status === "paused");

  return (
    <div className={styles.control}>
      {beta}
      {remaining > 0 ? (
        <Button
          kind="primary"
          size="sm"
          renderIcon={Renew}
          disabled={batch.busy}
          onClick={() => void batch.resume()}
        >
          {interrupted
            ? t("grading.batch.resume")
            : t("grading.batch.fill", { count: remaining })}
        </Button>
      ) : (
        <Tag type="green" size="sm">
          {t("grading.batch.allWritten")}
        </Tag>
      )}
    </div>
  );
}
