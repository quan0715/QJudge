import React, { useEffect } from "react";
import { useForm, FormProvider, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { BankQuestion } from "@/core/entities/question-bank.entity";
import { BankCodingEditProvider } from "@/features/question-banks/contexts/BankCodingEditContext";
import { bankQuestionToFormSchema } from "@/features/question-banks/adapters/bankCodingFormAdapters";
import { CodingProblemEditorShell } from "@/features/problems/components";
import { MarkdownEditorProvider } from "@/shared/ui/markdown/markdownEditor";
import {
  DEFAULT_PROBLEM_FORM_VALUES,
  type ProblemFormSchema,
} from "@/features/problems/forms/problemFormSchema";
import { problemFormSchema } from "@/features/problems/forms/problemFormValidation";

interface EmbeddedEditorInnerProps {
  bankId: string;
  bankQuestion: BankQuestion;
  onDelete: () => Promise<void>;
  onClose?: () => void;
}

const EmbeddedEditorInner: React.FC<EmbeddedEditorInnerProps> = ({
  bankId,
  bankQuestion,
  onDelete,
  onClose,
}) => {
  const methods = useForm<ProblemFormSchema>({
    defaultValues: DEFAULT_PROBLEM_FORM_VALUES,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(problemFormSchema) as any,
    mode: "onBlur",
  });

  const { reset } = methods;
  const formValues = useWatch({ control: methods.control });

  useEffect(() => {
    const formData = bankQuestionToFormSchema(bankQuestion);
    reset(formData, { keepDefaultValues: false });
  }, [bankQuestion, reset]);

  return (
    <MarkdownEditorProvider>
      <FormProvider {...methods}>
        <BankCodingEditProvider bankId={bankId} bankItemId={bankQuestion.bankItemId}>
          <CodingProblemEditorShell
            title={bankQuestion.title}
            formValues={formValues as ProblemFormSchema}
            onDelete={onDelete}
            showPreview={false}
            onBack={onClose}
            hideBackButton={!onClose}
          />
        </BankCodingEditProvider>
      </FormProvider>
    </MarkdownEditorProvider>
  );
};

interface EmbeddedBankCodingEditorProps {
  bankQuestion: BankQuestion;
  bankId: string;
  onSaved?: () => void;
  onDelete: () => Promise<void>;
  onClose?: () => void;
}

const EmbeddedBankCodingEditor: React.FC<EmbeddedBankCodingEditorProps> = ({
  bankId,
  bankQuestion,
  onDelete,
  onClose,
}) => (
  <EmbeddedEditorInner bankId={bankId} bankQuestion={bankQuestion} onDelete={onDelete} onClose={onClose} />
);

export default EmbeddedBankCodingEditor;
