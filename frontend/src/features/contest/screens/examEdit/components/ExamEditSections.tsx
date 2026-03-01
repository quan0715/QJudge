import React from "react";
import { Button } from "@carbon/react";
import { DocumentBlank, ChartBar, DocumentPdf } from "@carbon/icons-react";
import { ScrollSpyLayout, type NavSection } from "@/shared/components/scrollSpy";
import type { ContestDetail, ExamQuestion } from "@/core/entities/contest.entity";
import { useExamPdfExport } from "../pdf/useExamPdfExport";
import ExamQuestionsSection from "../sections/ExamQuestionsSection";
import ExamScoringSummary from "../sections/ExamScoringSummary";

const EXAM_SECTIONS: NavSection[] = [
  { id: "scoring-summary", label: "配分總覽", icon: ChartBar },
  { id: "exam-questions", label: "考試題目", icon: DocumentBlank },
];

interface ExamEditSectionsProps {
  contestId: string;
  contestName: string;
  contest: ContestDetail | null;
  questions: ExamQuestion[];
  onQuestionsChange: (questions: ExamQuestion[]) => void;
}

const ExamEditSections: React.FC<ExamEditSectionsProps> = ({
  contestId,
  contest,
  questions,
  onQuestionsChange: handleQuestionsChange,
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
          <div style={{ padding: "2rem 0", borderBottom: "1px solid var(--cds-border-subtle-01)" }}>
            <ExamScoringSummary
              questions={questions}
              registerRef={registerSection("scoring-summary")}
            />
          </div>

          <div style={{ padding: "2rem 0" }}>
            <ExamQuestionsSection
              contestId={contestId}
              registerRef={registerSection("exam-questions")}
              onQuestionsChange={handleQuestionsChange}
              frozen={!!contest?.isExamQuestionsFrozen}
            />
          </div>
        </div>
      )}
    </ScrollSpyLayout>
  );
};

export default ExamEditSections;
