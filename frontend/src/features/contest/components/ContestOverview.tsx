import { useState } from "react";
import { Button, InlineNotification } from "@carbon/react";
import { DocumentPdf } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import { downloadMyReport } from "@/infrastructure/api/repositories";
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
  const [reportDownloading, setReportDownloading] = useState(false);
  const [reportNotification, setReportNotification] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const isPaperExam = contest.contestType === "paper_exam";

  // Check if user can download their own report
  // - coding: after submission
  // - paper_exam: after submission AND results published
  const canDownloadReport =
    contest.examStatus === "submitted" &&
    (contest.hasJoined || contest.isRegistered) &&
    (!isPaperExam || contest.resultsPublished === true);

  const handleDownloadReport = async () => {
    try {
      setReportDownloading(true);
      setReportNotification({ kind: "success", message: t("report.generating") });

      await downloadMyReport(contest.id.toString());

      setReportNotification({ kind: "success", message: t("report.downloaded") });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : t("report.failed");
      setReportNotification({
        kind: "error",
        message: errorMessage,
      });
    } finally {
      setReportDownloading(false);
    }
  };

  return (
    <div className={styles.root} style={{ maxWidth, margin: maxWidth ? "0 auto" : undefined, padding: "1rem" }}>
        {/* Exam Mode Warning */}
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

        {/* Personal Report Download - Only after submission */}
        {canDownloadReport && (
          <section className={styles.section} aria-label={t("report.title")}>
            <h2 className={styles.sectionTitle}>{t("report.title")}</h2>
            {reportNotification && (
              <InlineNotification
                kind={reportNotification.kind}
                title={reportNotification.kind === "success" ? "" : t("common:error.title")}
                subtitle={reportNotification.message}
                onClose={() => setReportNotification(null)}
                lowContrast
                style={{ marginBottom: "0.75rem" }}
              />
            )}
            <div className={styles.reportRow}>
              <div className={styles.reportDescription}>
                {isPaperExam
                  ? t("report.descriptionPaper")
                  : t("report.descriptionCoding")}
              </div>
              <Button
                kind="tertiary"
                size="md"
                renderIcon={DocumentPdf}
                onClick={handleDownloadReport}
                disabled={reportDownloading}
              >
                {reportDownloading ? t("report.preparing") : t("report.download")}
              </Button>
            </div>
          </section>
        )}
    </div>
  );
};
