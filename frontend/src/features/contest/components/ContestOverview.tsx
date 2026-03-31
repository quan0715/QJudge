import { InlineNotification } from "@carbon/react";
import { useTranslation } from "react-i18next";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import type { ContestDetail } from "@/core/entities/contest.entity";
import styles from "./ContestOverview.module.scss";

interface ContestOverviewProps {
  contest: ContestDetail;
  maxWidth?: string;
}

export const ContestOverview: React.FC<ContestOverviewProps> = ({
  contest,
  maxWidth,
}) => {
  const { t } = useTranslation("contest");

  return (
    <div className={styles.root} style={{ maxWidth, margin: maxWidth ? "0 auto" : undefined, padding: "1rem" }}>
      {contest.cheatDetectionEnabled && (
        <InlineNotification
          kind="warning"
          title={t("overview.examModeWarning")}
          subtitle={t("overview.examModeDesc")}
          lowContrast
          hideCloseButton
          style={{ maxWidth: "100%" }}
        />
      )}

      {contest.rules && (
        <section className={styles.section} aria-label={t("overview.contestRules")}>
          <h2 className={styles.sectionTitle}>{t("overview.contestRules")}</h2>
          <MarkdownRenderer className={styles.rulesContent}>
            {contest.rules}
          </MarkdownRenderer>
        </section>
      )}
    </div>
  );
};
