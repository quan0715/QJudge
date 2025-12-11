import { useState } from "react";
import { Button, InlineNotification } from "@carbon/react";
import { Time, Download } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import MarkdownRenderer from "@/ui/components/common/MarkdownRenderer";
import ContainerCard from "@/ui/components/layout/ContainerCard";
import SurfaceSection from "@/ui/components/layout/SurfaceSection";
import { SubmissionStatusBadge } from "@/ui/components/badges/SubmissionStatusBadge";
import { ContestDownloadModal } from "./modals/ContestDownloadModal";
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

            {/* Download Contest Files Section */}
            {(contest.hasJoined ||
              contest.isRegistered ||
              contest.permissions?.canEditContest) && (
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
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.875rem",
                  }}
                >
                  <thead>
                    <tr>
                      <th
                        style={{
                          backgroundColor: "var(--cds-layer-02)",
                          border: "1px solid var(--cds-border-subtle)",
                          padding: "0.75rem",
                          textAlign: "left",
                          fontWeight: 600,
                          width: "60px",
                        }}
                      >
                        {t("overview.problemColumn")}
                      </th>
                      <th
                        style={{
                          backgroundColor: "var(--cds-layer-02)",
                          border: "1px solid var(--cds-border-subtle)",
                          padding: "0.75rem",
                          textAlign: "left",
                          fontWeight: 600,
                        }}
                      >
                        {t("overview.topicColumn")}
                      </th>
                      <th
                        style={{
                          backgroundColor: "var(--cds-layer-02)",
                          border: "1px solid var(--cds-border-subtle)",
                          padding: "0.75rem",
                          textAlign: "center",
                          fontWeight: 600,
                          width: "80px",
                        }}
                      >
                        {t("overview.scoreColumn")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {contest.problems.map((problem) => (
                      <tr key={problem.id}>
                        <td
                          style={{
                            border: "1px solid var(--cds-border-subtle)",
                            padding: "0.75rem",
                          }}
                        >
                          {problem.label}
                        </td>
                        <td
                          style={{
                            border: "1px solid var(--cds-border-subtle)",
                            padding: "0.75rem",
                          }}
                        >
                          {problem.title}
                        </td>
                        <td
                          style={{
                            border: "1px solid var(--cds-border-subtle)",
                            padding: "0.75rem",
                            textAlign: "center",
                          }}
                        >
                          {problem.score ?? "-"}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td
                        colSpan={2}
                        style={{
                          border: "1px solid var(--cds-border-subtle)",
                          padding: "0.75rem",
                          fontWeight: 600,
                          backgroundColor: "var(--cds-layer-02)",
                        }}
                      >
                        {t("overview.total")}
                      </td>
                      <td
                        style={{
                          border: "1px solid var(--cds-border-subtle)",
                          padding: "0.75rem",
                          textAlign: "center",
                          fontWeight: 600,
                          backgroundColor: "var(--cds-layer-02)",
                        }}
                      >
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
