import React, { useEffect, useMemo, useCallback } from "react";
import { useForm, FormProvider, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@carbon/react";
import { View } from "@carbon/icons-react";
import type { BankQuestion } from "@/core/entities/question-bank.entity";
import { BankCodingEditProvider } from "@/features/question-banks/contexts/BankCodingEditContext";
import { bankQuestionToFormSchema } from "@/features/question-banks/adapters/bankCodingFormAdapters";
import { useProblemEdit } from "@/features/problems/contexts/ProblemEditContext";
import { MarkdownEditorProvider } from "@/shared/ui/markdown/markdownEditor";
import { TriggerModal, type TriggerModalHandle } from "@/shared/ui/modal";
import { GlobalSaveStatus } from "@/features/problems/components/edit/common";
import {
  DEFAULT_PROBLEM_FORM_VALUES,
  type ProblemFormSchema,
} from "@/features/problems/forms/problemFormSchema";
import { problemFormSchema } from "@/features/problems/forms/problemFormValidation";
import ProblemEditHeader from "@/features/problems/screens/problemsIdEdit/components/ProblemEditHeader";
import ProblemEditSections from "@/features/problems/screens/problemsIdEdit/components/ProblemEditSections";
import ProblemEditPreviewModal from "@/features/problems/screens/problemsIdEdit/components/ProblemEditPreviewModal";
import {
  ProblemEditUIProvider,
  useProblemEditUI,
} from "@/features/problems/screens/problemsIdEdit/contexts/ProblemEditUIContext";
import {
  BASE_SECTIONS,
  getSectionValidationState,
} from "@/features/problems/screens/problemsIdEdit/utils/sectionConfig";
import { formSchemaToPreview } from "@/features/problems/screens/problemsIdEdit/utils/previewAdapter";
import type { NavSection } from "@/features/problems/screens/problemsIdEdit/section/layout";
import "@/features/problems/screens/problemsIdEdit/screen.scss";
import styles from "./EmbeddedBankCodingEditor.module.scss";

/* ── Inner editor content ───────────────────────────────────── */

const EditorContent: React.FC<{
  title: string;
  sectionsWithValidation: NavSection[];
}> = ({ title, sectionsWithValidation }) => {
  const { autoSave } = useProblemEdit();
  const { watch } = useFormContext<ProblemFormSchema>();
  const previewModalRef = React.useRef<TriggerModalHandle>(null);

  const watchedValues = watch();
  const previewData = useMemo(
    () => formSchemaToPreview(watchedValues),
    [watchedValues]
  );

  // Filter out danger-zone section (handled by parent panel)
  const visibleSections = useMemo(
    () => sectionsWithValidation.filter((s) => s.id !== "danger-zone"),
    [sectionsWithValidation]
  );

  return (
    <div className={styles.editorRoot}>
      <ProblemEditHeader
        title={title || "Untitled"}
        onBack={() => {/* no-op in embedded mode */}}
        globalSaveStatus={<GlobalSaveStatus status={autoSave.globalStatus} />}
        actions={
          <Button
            kind="secondary"
            size="sm"
            renderIcon={View}
            onClick={() => previewModalRef.current?.open()}
          >
            Preview
          </Button>
        }
      />

      <div className={styles.editorContent}>
        <ProblemEditSections
          sections={visibleSections}
          onPreviewClick={() => previewModalRef.current?.open()}
          problemTitle={title}
          visibility="private"
          onVisibilityChange={async () => {}}
          onDelete={async () => {}}
          hideSidebar={true}
        />
      </div>

      <TriggerModal
        ref={previewModalRef}
        renderModal={({ open, onClose }) => (
          <ProblemEditPreviewModal
            open={open}
            onClose={onClose}
            previewData={previewData}
          />
        )}
      />
    </div>
  );
};

/* ── Provider wrapper ───────────────────────────────────────── */

const EmbeddedEditorInner: React.FC<{
  bankQuestion: BankQuestion;
}> = ({ bankQuestion }) => {
  const methods = useForm<ProblemFormSchema>({
    defaultValues: DEFAULT_PROBLEM_FORM_VALUES,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(problemFormSchema) as any,
    mode: "onBlur",
  });

  const {
    reset,
    formState: { errors, touchedFields },
  } = methods;

  // Convert BankQuestion to form schema and reset form when question changes
  useEffect(() => {
    const formData = bankQuestionToFormSchema(bankQuestion);
    reset(formData, { keepDefaultValues: false });
  }, [bankQuestion.id, bankQuestion.updatedAt, reset]);

  const sectionsWithValidation: NavSection[] = useMemo(() => {
    return BASE_SECTIONS.map((section) => {
      const { state, errorCount } = getSectionValidationState(
        section.id,
        errors as Record<string, unknown>,
        touchedFields as Record<string, unknown>
      );
      return { ...section, validationState: state, errorCount };
    });
  }, [errors, touchedFields]);

  return (
    <MarkdownEditorProvider>
      <FormProvider {...methods}>
        <BankCodingEditProvider questionId={bankQuestion.id}>
          <EditorContent
            title={bankQuestion.title}
            sectionsWithValidation={sectionsWithValidation}
          />
        </BankCodingEditProvider>
      </FormProvider>
    </MarkdownEditorProvider>
  );
};

/* ── Public API ─────────────────────────────────────────────── */

interface EmbeddedBankCodingEditorProps {
  bankQuestion: BankQuestion;
  bankId: string;
  onSaved?: () => void;
}

const EmbeddedBankCodingEditor: React.FC<EmbeddedBankCodingEditorProps> = ({
  bankQuestion,
}) => (
  <ProblemEditUIProvider>
    <EmbeddedEditorInner bankQuestion={bankQuestion} />
  </ProblemEditUIProvider>
);

export default EmbeddedBankCodingEditor;
