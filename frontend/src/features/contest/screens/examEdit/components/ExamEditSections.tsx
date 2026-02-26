import React from "react";
import { Button } from "@carbon/react";
import { Information, Settings, DocumentBlank, ChartBar, WarningAlt, DocumentPdf } from "@carbon/icons-react";
import { ScrollSpyLayout, type NavSection } from "@/shared/components/scrollSpy";
import type { ContestDetail, ExamQuestion } from "@/core/entities/contest.entity";
import { useExamPdfExport } from "../pdf/useExamPdfExport";
import ExamBasicInfoSection from "../sections/ExamBasicInfoSection";
import ExamSettingsSection from "../sections/ExamSettingsSection";
import ExamQuestionsSection from "../sections/ExamQuestionsSection";
import ExamScoringSummary from "../sections/ExamScoringSummary";
import ExamDangerZoneSection from "../sections/ExamDangerZoneSection";

const EXAM_SECTIONS: NavSection[] = [
  { id: "basic-info", label: "基本資訊", icon: Information },
  { id: "exam-settings", label: "考試設定", icon: Settings },
  { id: "exam-questions", label: "考試題目", icon: DocumentBlank },
  { id: "scoring-summary", label: "配分總覽", icon: ChartBar },
  { id: "danger-zone", label: "Danger Zone", icon: WarningAlt },
];

interface ExamEditSectionsProps {
  contestId: string;
  contestName: string;
  contest: ContestDetail | null;
  questions: ExamQuestion[];
  onQuestionsChange: (questions: ExamQuestion[]) => void;
  onArchive: () => Promise<void>;
  onDelete: () => Promise<void>;
}

const ExamEditSections: React.FC<ExamEditSectionsProps> = ({
  contestId,
  contestName,
  contest,
  questions,
  onQuestionsChange: handleQuestionsChange,
  onArchive,
  onDelete,
}) => {
  const { exportPdf, generating } = useExamPdfExport({ contest, questions });

  const pdfFooter =
    contest && questions.length > 0 ? (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={DocumentPdf}
          disabled={generating}
          onClick={() => exportPdf("question")}
          style={{ justifyContent: "flex-start" }}
        >
          {generating ? "產生中..." : "輸出題目卷"}
        </Button>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={DocumentPdf}
          disabled={generating}
          onClick={() => exportPdf("answer")}
          style={{ justifyContent: "flex-start" }}
        >
          {generating ? "產生中..." : "輸出答案卷"}
        </Button>
      </div>
    ) : null;

  return (
    <ScrollSpyLayout sections={EXAM_SECTIONS} footerContent={pdfFooter}>
      {({ registerSection }) => (
        <div style={{ padding: "2rem", maxWidth: "900px", margin: "0 auto" }}>
          <div style={{ paddingBottom: "2rem", borderBottom: "1px solid var(--cds-border-subtle-01)" }}>
            <ExamBasicInfoSection registerRef={registerSection("basic-info")} />
          </div>

          <div style={{ padding: "2rem 0", borderBottom: "1px solid var(--cds-border-subtle-01)" }}>
            <ExamSettingsSection registerRef={registerSection("exam-settings")} />
          </div>

          <div style={{ padding: "2rem 0", borderBottom: "1px solid var(--cds-border-subtle-01)" }}>
            <ExamQuestionsSection
              contestId={contestId}
              registerRef={registerSection("exam-questions")}
              onQuestionsChange={handleQuestionsChange}
            />
          </div>

          <div style={{ padding: "2rem 0", borderBottom: "1px solid var(--cds-border-subtle-01)" }}>
            <ExamScoringSummary
              questions={questions}
              registerRef={registerSection("scoring-summary")}
            />
          </div>

          <div style={{ padding: "2rem 0", borderTop: "2px solid var(--cds-support-error)", marginTop: "1rem" }}>
            <ExamDangerZoneSection
              contestName={contestName}
              onArchive={onArchive}
              onDelete={onDelete}
              registerRef={registerSection("danger-zone")}
            />
          </div>
        </div>
      )}
    </ScrollSpyLayout>
  );
};

export default ExamEditSections;
