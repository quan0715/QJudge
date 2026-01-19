import { useState } from "react";
import { Button, InlineNotification } from "@carbon/react";
import { Download, DocumentPdf } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import ContainerCard from "@/shared/layout/ContainerCard";
import SurfaceSection from "@/shared/layout/SurfaceSection";
import { ContestDownloadModal } from "./modals/ContestDownloadModal";
import { downloadMyReport } from "@/infrastructure/api/repositories";
import type { ContestDetail } from "@/core/entities/contest.entity";

interface ContestOverviewProps {
  contest: ContestDetail;
  maxWidth?: string;
}

export const ContestOverview: React.FC<ContestOverviewProps> = ({
  contest,
  maxWidth,
}) => {
  const { t } = useTranslation("contest");
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [reportDownloading, setReportDownloading] = useState(false);
  const [reportNotification, setReportNotification] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  // Check if user can download their own report (only after submission)
  const canDownloadReport =
    contest.examStatus === "submitted" && (contest.hasJoined || contest.isRegistered);

  const handleDownloadReport = async () => {
    try {
      setReportDownloading(true);
      setReportNotification({ kind: "success", message: "正在產生報告..." });
      await downloadMyReport(contest.id.toString());
      setReportNotification({ kind: "success", message: "報告已下載" });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "下載報告失敗";
      setReportNotification({
        kind: "error",
        message: errorMessage,
      });
    } finally {
      setReportDownloading(false);
    }
  };

  return (
    <SurfaceSection maxWidth={maxWidth} style={{ minHeight: "100%", flex: 1 }}>
      {/* Exam Mode Warning */}
      {contest.examModeEnabled && (
        <InlineNotification
          kind="warning"
          title={t("overview.examModeWarning")}
          subtitle={t("overview.examModeDesc")}
          lowContrast
          hideCloseButton
          style={{ marginBottom: "1.5rem", maxWidth: "100%" }}
        />
      )}

      {/* Download Contest Files Section - Only for admins/teachers */}
      {contest.permissions?.canEditContest && (
        <ContainerCard
          title={t("overview.contestFiles")}
          style={{ marginBottom: "1.5rem" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                color: "var(--cds-text-secondary)",
                fontSize: "0.875rem",
              }}
            >
              {t("overview.downloadDesc")}
            </div>
            <Button
              kind="primary"
              size="md"
              renderIcon={Download}
              onClick={() => setDownloadModalOpen(true)}
            >
              {t("overview.download")}
            </Button>
          </div>
        </ContainerCard>
      )}

      {contest.rules && (
        <ContainerCard
          title={t("overview.contestRules")}
          style={{ marginBottom: "1.5rem" }}
        >
          <MarkdownRenderer style={{ marginTop: "0.5rem" }}>
            {contest.rules}
          </MarkdownRenderer>
        </ContainerCard>
      )}

      {/* Personal Report Download - Only after submission */}
      {canDownloadReport && (
        <ContainerCard
          title="個人成績報告"
          style={{ marginBottom: "1.5rem" }}
        >
          {reportNotification && (
            <InlineNotification
              kind={reportNotification.kind}
              title={reportNotification.kind === "success" ? "" : "錯誤"}
              subtitle={reportNotification.message}
              onClose={() => setReportNotification(null)}
              lowContrast
              style={{ marginBottom: "0.75rem" }}
            />
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                fontSize: "0.875rem",
                color: "var(--cds-text-secondary)",
              }}
            >
              下載包含解題統計、程式碼和趨勢圖的 PDF 報告
            </div>
            <Button
              kind="tertiary"
              size="md"
              renderIcon={DocumentPdf}
              onClick={handleDownloadReport}
              disabled={reportDownloading}
            >
              {reportDownloading ? "產生中..." : "下載報告"}
            </Button>
          </div>
        </ContainerCard>
      )}

      <ContestDownloadModal
        contestId={contest.id.toString()}
        contestName={contest.name}
        open={downloadModalOpen}
        onClose={() => setDownloadModalOpen(false)}
      />
    </SurfaceSection>
  );
};
