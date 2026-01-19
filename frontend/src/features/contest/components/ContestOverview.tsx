import { useState } from "react";
import { Button, InlineNotification } from "@carbon/react";
import { Time, Download, DocumentPdf } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import ContainerCard from "@/shared/layout/ContainerCard";
import SurfaceSection from "@/shared/layout/SurfaceSection";
import { SubmissionStatusBadge } from "@/shared/ui/tag";
import { ContestDownloadModal } from "./modals/ContestDownloadModal";
import { downloadMyReport } from "@/infrastructure/api/repositories";
import type {
  ContestDetail,
  ScoreboardRow,
} from "@/core/entities/contest.entity";
import type { Submission } from "@/core/entities/submission.entity";

interface ContestOverviewProps {
  contest: ContestDetail;
  myRank: ScoreboardRow | null;
  mySubmissions: Submission[];
  onSubmissionClick: (submissionId: string) => void;
  onViewAllSubmissions: () => void;
  maxWidth?: string;
}

export const ContestOverview: React.FC<ContestOverviewProps> = ({
  contest,
  myRank,
  mySubmissions,
  onSubmissionClick,
  onViewAllSubmissions,
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
    } catch (error: any) {
      setReportNotification({
        kind: "error",
        message: error.message || "下載報告失敗",
      });
    } finally {
      setReportDownloading(false);
    }
  };

  return (
    <SurfaceSection maxWidth={maxWidth} style={{ minHeight: "100%", flex: 1 }}>
      <div className="cds--grid" style={{ padding: 0 }}>
        <div className="cds--row">
          {/* Left Column: Description & Rules */}
          <div className="cds--col-lg-10 cds--col-md-8">
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

            {/* Problem Structure Table */}
            {contest.problems && contest.problems.length > 0 && (
              <ContainerCard
                title={t("overview.problemStructure")}
                style={{ marginBottom: "1.5rem" }}
              >
                <table className="cds-data-table">
                  <thead>
                    <tr>
                      <th style={{ width: "60px" }}>
                        {t("overview.problemColumn")}
                      </th>
                      <th>{t("overview.topicColumn")}</th>
                      <th style={{ width: "80px", textAlign: "center" }}>
                        {t("overview.scoreColumn")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {contest.problems.map((problem) => (
                      <tr key={problem.id}>
                        <td>{problem.label}</td>
                        <td>{problem.title}</td>
                        <td style={{ textAlign: "center" }}>
                          {problem.score ?? "-"}
                        </td>
                      </tr>
                    ))}
                    <tr className="total-row">
                      <td colSpan={2}>{t("overview.total")}</td>
                      <td style={{ textAlign: "center" }}>
                        {contest.problems.reduce(
                          (sum, p) => sum + (p.score || 0),
                          0
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </ContainerCard>
            )}
          </div>

          {/* Right Column: Stats or other info (previously registration was here) */}
          <div className="cds--col-lg-6 cds--col-md-8">
            {/* Only show stats if joined, otherwise maybe show something else or nothing */}
            {(contest.hasJoined || contest.isRegistered) &&
              new Date(contest.startTime) <= new Date() && (
                <ContainerCard
                  title={t("overview.myScore")}
                  style={{ marginBottom: "1.5rem" }}
                >
                  {myRank ? (
                    <div style={{ marginBottom: "1.5rem" }}>
                      <div
                        style={{
                          fontSize: "2rem",
                          fontWeight: 300,
                          marginBottom: "0.5rem",
                        }}
                      >
                        Rank {myRank.rank}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: "1rem",
                          color: "var(--cds-text-secondary)",
                        }}
                      >
                        <div>Solved: {myRank.solvedCount}</div>
                        <div>Penalty: {myRank.penalty}</div>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: "1rem",
                        textAlign: "center",
                        color: "var(--cds-text-secondary)",
                      }}
                    >
                      {t("overview.noRankData")}
                    </div>
                  )}

                  {/* Download Report Section - Only after submission */}
                  {canDownloadReport && (
                    <div
                      style={{
                        marginBottom: "1.5rem",
                        padding: "1rem",
                        backgroundColor: "var(--cds-layer-01)",
                        borderRadius: "4px",
                        border: "1px solid var(--cds-border-subtle)",
                      }}
                    >
                      {reportNotification && (
                        <InlineNotification
                          kind={reportNotification.kind}
                          title={
                            reportNotification.kind === "success"
                              ? ""
                              : "錯誤"
                          }
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
                        <div>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: "0.875rem",
                              marginBottom: "0.25rem",
                            }}
                          >
                            個人成績報告
                          </div>
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--cds-text-secondary)",
                            }}
                          >
                            下載包含解題統計、程式碼和趨勢圖的 PDF 報告
                          </div>
                        </div>
                        <Button
                          kind="tertiary"
                          size="sm"
                          renderIcon={DocumentPdf}
                          onClick={handleDownloadReport}
                          disabled={reportDownloading}
                        >
                          {reportDownloading ? "產生中..." : "下載報告"}
                        </Button>
                      </div>
                    </div>
                  )}

                  <h5
                    style={{
                      marginBottom: "1rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      color: "var(--cds-text-secondary)",
                    }}
                  >
                    <Time size={16} /> {t("overview.recentSubmissions")}
                  </h5>

                  {mySubmissions.length > 0 ? (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem",
                      }}
                    >
                      {mySubmissions.map((sub) => (
                        <div
                          key={sub.id}
                          onClick={() => onSubmissionClick(sub.id.toString())}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "0.5rem",
                            borderBottom: "1px solid var(--cds-border-subtle)",
                            cursor: "pointer",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                            }}
                          >
                            <SubmissionStatusBadge
                              status={sub.status}
                              size="sm"
                            />
                            <span style={{ fontSize: "0.875rem" }}>
                              {sub.problemId}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--cds-text-secondary)",
                            }}
                          >
                            {new Date(sub.createdAt).toLocaleString()}
                          </div>
                        </div>
                      ))}
                      <div style={{ marginTop: "1rem", textAlign: "right" }}>
                        <Button
                          kind="ghost"
                          size="sm"
                          onClick={onViewAllSubmissions}
                        >
                          {t("overview.viewAll")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        color: "var(--cds-text-secondary)",
                        fontSize: "0.875rem",
                      }}
                    >
                      {t("overview.noSubmissions")}
                    </div>
                  )}
                </ContainerCard>
              )}
          </div>
        </div>
      </div>

      <ContestDownloadModal
        contestId={contest.id.toString()}
        contestName={contest.name}
        open={downloadModalOpen}
        onClose={() => setDownloadModalOpen(false)}
      />
    </SurfaceSection>
  );
};
