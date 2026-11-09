import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ExecutionType } from "@/core/types/solver.types";
import { useInterval } from "@/shared/hooks/useInterval";
import { getHeaderStatusIcon } from "./StatusHelpers";
import type { HeaderInfo } from "./utils";
import styles from "./TestResultHeader.module.scss";

interface TestResultHeaderProps {
  header: HeaderInfo;
  /** Test runs are practice; submissions are graded. The label says which one this is. */
  kind: ExecutionType;
  isPending: boolean;
  /** Client time (ms) the run started; shown as the waiting seconds while pending. */
  startedAt?: number;
  /** Shown after a submission, e.g. a link to the problem's submission history. */
  action?: React.ReactNode;
}

const WaitingSeconds: React.FC<{ startedAt: number }> = ({ startedAt }) => {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useInterval(() => setNow(Date.now()), 1000);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return <>{t("solver.waitingSeconds", `已等待 ${seconds} 秒`, { seconds })}</>;
};

/** One line: verdict, whether it counts, and the counts behind it. */
export const TestResultHeader: React.FC<TestResultHeaderProps> = ({ header, kind, isPending, startedAt, action }) => {
  const { t } = useTranslation();
  const kindLabel = kind === "submit"
    ? t("solver.submissionKind", "正式提交 · 計入成績")
    : t("solver.testKind", "測試 · 不計分");

  return (
    <div className={styles.header} data-tone={header.type}>
      <span className={styles.icon}>{getHeaderStatusIcon(header.type)}</span>
      <h3 className={styles.title}>{header.title}</h3>
      <span className={styles.subtitle}>
        {isPending ? startedAt !== undefined && <WaitingSeconds startedAt={startedAt} /> : header.subtitle}
      </span>
      <span className={styles.kind}>{kindLabel}</span>
      {action && <span className={styles.action}>{action}</span>}
    </div>
  );
};

export default TestResultHeader;
