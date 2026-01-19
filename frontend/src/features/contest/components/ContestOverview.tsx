import { useState } from "react";
import { Button, InlineNotification } from "@carbon/react";
import { Download } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import ContainerCard from "@/shared/layout/ContainerCard";
import SurfaceSection from "@/shared/layout/SurfaceSection";
import { ContestDownloadModal } from "./modals/ContestDownloadModal";
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

      <ContestDownloadModal
        contestId={contest.id.toString()}
        contestName={contest.name}
        open={downloadModalOpen}
        onClose={() => setDownloadModalOpen(false)}
      />
    </SurfaceSection>
  );
};
