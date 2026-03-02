import React, { useEffect, useState } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loading } from "@carbon/react";
import type { ContestDetail, ExamQuestion } from "@/core/entities/contest.entity";
import { GlobalSaveStatus } from "@/shared/ui/autoSave";
import { ExamEditProvider, useExamEdit } from "./contexts/ExamEditContext";
import {
  DEFAULT_EXAM_FORM_VALUES,
  type ExamFormSchema,
} from "./forms/examFormSchema";
import { examFormSchema } from "./forms/examFormValidation";
import ExamEditSections from "./components/ExamEditSections";

interface ExamEditorPanelProps {
  contestId: string;
  contest: ContestDetail;
}

/** Inner content that consumes ExamEditContext */
const ExamEditorPanelContent: React.FC<{
  contestId: string;
  contest: ContestDetail;
}> = ({ contestId, contest }) => {
  const { autoSave } = useExamEdit();
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);

  return (
    <div style={{
      height: "100%",
      display: "flex",
      flexDirection: "column",
    }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "0.5rem 1rem",
          borderBottom: "1px solid var(--cds-border-subtle)",
          flexShrink: 0,
        }}
      >
        <GlobalSaveStatus status={autoSave.globalStatus} />
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <ExamEditSections
          contestId={contestId}
          contestName={contest.name || ""}
          contest={contest}
          questions={questions}
          onQuestionsChange={setQuestions}
        />
      </div>
    </div>
  );
};

/**
 * Embeddable Exam Editor panel for use inside Admin Dashboard.
 * Wraps the exam editor core (FormProvider + ExamEditProvider + Sections)
 * without the full-screen fixed overlay or header.
 */
const ExamEditorPanel: React.FC<ExamEditorPanelProps> = ({
  contestId,
  contest,
}) => {
  const methods = useForm<ExamFormSchema>({
    defaultValues: DEFAULT_EXAM_FORM_VALUES,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(examFormSchema) as any,
    mode: "onBlur",
  });

  const { reset } = methods;

  useEffect(() => {
    if (!contest) return;
    reset({
      name: contest.name ?? "",
      description: contest.description ?? "",
      rules: contest.rules ?? "",
      startTime: contest.startTime ?? "",
      endTime: contest.endTime ?? "",
      status: contest.status ?? "draft",
      visibility: contest.visibility ?? "public",
      password: contest.password ?? "",
      cheatDetectionEnabled: contest.cheatDetectionEnabled ?? false,
      maxCheatWarnings: contest.maxCheatWarnings ?? 3,
      allowMultipleJoins: contest.allowMultipleJoins ?? false,
      allowAutoUnlock: contest.allowAutoUnlock ?? false,
      autoUnlockMinutes: contest.autoUnlockMinutes ?? 5,
    });
  }, [contest, reset]);

  if (!contest) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
        <Loading withOverlay={false} />
      </div>
    );
  }

  return (
    <FormProvider {...methods}>
      <ExamEditProvider contestId={contestId}>
        <ExamEditorPanelContent
          contestId={contestId}
          contest={contest}
        />
      </ExamEditProvider>
    </FormProvider>
  );
};

export default ExamEditorPanel;
