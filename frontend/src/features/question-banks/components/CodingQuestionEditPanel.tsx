import { useForm, FormProvider } from "react-hook-form";
import { Button } from "@carbon/react";
import { useTranslation } from "react-i18next";
import type { BankQuestion } from "@/core/entities/question-bank.entity";
import { updateQuestion } from "@/infrastructure/api/repositories/questionBank.repository";
import { ProblemEditProvider, useProblemEdit } from "@/features/problems/contexts/ProblemEditContext";
import CodingProblemEditor from "@/features/problems/components/codingEditor/CodingProblemEditor";
import type { ProblemFormSchema } from "@/features/problems/forms/problemFormSchema";
import { MarkdownEditorProvider } from "@/shared/ui/markdown/markdownEditor";
import { GlobalSaveStatus } from "@/shared/ui/autoSave";
import { bankQuestionToForm, bankQuestionFormPayload } from "../forms/codingQuestionForm";

function SaveStatus() {
  const { autoSave } = useProblemEdit();
  const { t } = useTranslation("common");
  return <div aria-live="polite">
    <GlobalSaveStatus status={autoSave.globalStatus} />
    {autoSave.globalStatus === "error" && <Button kind="ghost" size="sm" onClick={() => {
      Object.entries(autoSave.fieldStates).forEach(([field, state]) => {
        if (state.status === "error") autoSave.retrySave(field);
      });
    }}>{t("button.retry", "重試")}</Button>}
  </div>;
}

export interface CodingQuestionEditPanelProps {
  bankId: string;
  question: BankQuestion;
  onSaved?: () => void;
}

export default function CodingQuestionEditPanel({ bankId, question, onSaved }: CodingQuestionEditPanelProps) {
  const methods = useForm<ProblemFormSchema>({ defaultValues: bankQuestionToForm(question) });
  return <MarkdownEditorProvider>
    <FormProvider {...methods}>
      <ProblemEditProvider
        target={`bank:${bankId}:${question.bankItemId}`}
        write={() => updateQuestion(bankId, question.bankItemId, bankQuestionFormPayload(methods.getValues()))}
        onSaved={onSaved}
      >
        <SaveStatus />
        <CodingProblemEditor showTags={false} />
      </ProblemEditProvider>
    </FormProvider>
  </MarkdownEditorProvider>;
}
