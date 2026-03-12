import React, { useEffect, useMemo, useCallback } from "react";
// import { useNavigate } from "react-router-dom";
import { useForm, FormProvider, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, SkeletonText, SkeletonPlaceholder } from "@carbon/react";
import { Upload, Download, View } from "@carbon/icons-react";
import type { ProblemDetail, ProblemVisibility } from "@/core/entities/problem.entity";
import {
  patchProblem,
  deleteProblem,
} from "@/infrastructure/api/repositories/problem.repository";
// useAuth reserved for future permission checks
// import { useAuth } from "@/features/auth/contexts/AuthContext";
import {
  ProblemEditProvider,
  useProblemEdit,
} from "@/features/problems/contexts/ProblemEditContext";
import { MarkdownEditorProvider } from "@/shared/ui/markdown/markdownEditor";
import { TriggerModal, type TriggerModalHandle } from "@/shared/ui/modal";
import { ProblemImportModal } from "@/features/problems/components/modals";
import { GlobalSaveStatus } from "@/features/problems/components/edit/common";
import { useProblemDetail } from "@/features/problems/hooks";
import { useToast } from "@/shared/contexts";
import {
  DEFAULT_PROBLEM_FORM_VALUES,
  type ProblemFormSchema,
} from "@/features/problems/forms/problemFormSchema";
import { problemFormSchema } from "@/features/problems/forms/problemFormValidation";
import {
  yamlToFormSchema,
  formSchemaToApiPayload,
} from "@/features/problems/forms/problemFormAdapters";
import type { ProblemYAML } from "@/shared/utils/problemYamlParser";
import ProblemEditHeader from "@/features/problems/screens/problemsIdEdit/components/ProblemEditHeader";
import ProblemEditSections from "@/features/problems/screens/problemsIdEdit/components/ProblemEditSections";
import ProblemEditPreviewModal from "@/features/problems/screens/problemsIdEdit/components/ProblemEditPreviewModal";
import ProblemEditExportModal from "@/features/problems/screens/problemsIdEdit/components/ProblemEditExportModal";
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
import styles from "./EmbeddedProblemEditor.module.scss";

/* ── Inner content (mirrors ProblemEditScreenContent) ───────── */

const EditorContent: React.FC<{
  problem: ProblemDetail;
  sectionsWithValidation: NavSection[];
  handleYAMLImport: (yamlData: ProblemYAML) => void;
  handleVisibilityChange: (visibility: ProblemVisibility) => Promise<void>;
  handleDelete: () => Promise<void>;
  handleExportConfirm: (onClose: () => void) => void;
  onProblemUpdated: () => void;
}> = ({
  problem,
  sectionsWithValidation,
  handleYAMLImport,
  handleVisibilityChange,
  handleDelete,
  handleExportConfirm,
  onProblemUpdated: _onProblemUpdated,
}) => {
  const { autoSave } = useProblemEdit();
  const { exportFormat, setExportFormat, pdfScale, setPdfScale } =
    useProblemEditUI();
  const { watch } = useFormContext<ProblemFormSchema>();
  const previewModalRef = React.useRef<TriggerModalHandle>(null);

  const watchedValues = watch();
  const previewData = useMemo(
    () => formSchemaToPreview(watchedValues),
    [watchedValues],
  );

  return (
    <div className={styles.editorRoot}>
      <ProblemEditHeader
        title={problem.title || "Loading..."}
        onBack={() => {/* no-op in embedded mode */}}
        globalSaveStatus={<GlobalSaveStatus status={autoSave.globalStatus} />}
        actions={
          <>
            <TriggerModal
              trigger={
                <Button kind="ghost" renderIcon={Upload} size="sm">
                  Import
                </Button>
              }
              renderModal={({ open, onClose }) => (
                <ProblemImportModal
                  open={open}
                  onClose={onClose}
                  onPopulate={handleYAMLImport}
                  mode="populateForm"
                />
              )}
            />
            <TriggerModal
              trigger={
                <Button kind="ghost" renderIcon={Download} size="sm">
                  Export
                </Button>
              }
              renderModal={({ open, onClose }) => (
                <ProblemEditExportModal
                  open={open}
                  onClose={onClose}
                  onConfirm={() => handleExportConfirm(onClose)}
                  exportFormat={exportFormat}
                  onExportFormatChange={setExportFormat}
                  pdfScale={pdfScale}
                  onPdfScaleChange={setPdfScale}
                />
              )}
            />
            <Button
              kind="secondary"
              size="sm"
              renderIcon={View}
              onClick={() => previewModalRef.current?.open()}
            >
              Preview
            </Button>
          </>
        }
      />

      <div className={styles.editorContent}>
        <ProblemEditSections
          sections={sectionsWithValidation}
          onPreviewClick={() => previewModalRef.current?.open()}
          problemTitle={problem.title}
          visibility={watchedValues.visibility || "private"}
          onVisibilityChange={handleVisibilityChange}
          onDelete={handleDelete}
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

/* ── Provider wrapper (mirrors ProblemEditPageInner) ────────── */

const EmbeddedEditorInner: React.FC<{
  problemId: string;
  contestId: string;
  onRemoved?: () => void;
}> = ({ problemId, onRemoved }) => {
  const { showToast } = useToast();
  const { exportFormat, pdfScale } = useProblemEditUI();

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

  const { problem, formSchema, isLoading, error, refetch } = useProblemDetail(
    problemId,
    { scope: "manage" },
  );

  const handleProblemUpdated = useCallback(() => {
    refetch();
  }, [refetch]);

  const sectionsWithValidation: NavSection[] = useMemo(() => {
    return BASE_SECTIONS.map((section) => {
      const { state, errorCount } = getSectionValidationState(
        section.id,
        errors as Record<string, unknown>,
        touchedFields as Record<string, unknown>,
      );
      return { ...section, validationState: state, errorCount };
    });
  }, [errors, touchedFields]);

  useEffect(() => {
    if (!formSchema) return;
    reset(formSchema, { keepDefaultValues: false });
  }, [formSchema, reset]);

  const handleYAMLImport = useCallback(
    async (yamlData: ProblemYAML) => {
      const formData = yamlToFormSchema(yamlData);
      reset(formData, { keepDefaultValues: false });
      try {
        const apiPayload = formSchemaToApiPayload(formData);
        await patchProblem(problemId, apiPayload);
        showToast({ kind: "success", title: "Import Success" });
      } catch (err) {
        showToast({
          kind: "warning",
          title: "Imported but auto-save failed",
          subtitle: err instanceof Error ? err.message : "Please save manually",
        });
      }
    },
    [problemId, reset, showToast],
  );

  const handleVisibilityChange = async (newVisibility: ProblemVisibility) => {
    if (!problem) return;
    try {
      await patchProblem(problem.id, { visibility: newVisibility });
      methods.setValue("visibility", newVisibility);
      showToast({ kind: "success", title: "Visibility updated" });
    } catch (err) {
      showToast({
        kind: "error",
        title: "Failed",
        subtitle: err instanceof Error ? err.message : "Please try again",
      });
      throw err;
    }
  };

  const handleDelete = async () => {
    if (!problem) return;
    try {
      await deleteProblem(problem.id);
      showToast({ kind: "success", title: "Problem deleted" });
      onRemoved?.();
    } catch (err) {
      showToast({
        kind: "error",
        title: "Delete failed",
        subtitle: err instanceof Error ? err.message : "Please try again",
      });
      throw err;
    }
  };

  const handleExportConfirm = useCallback(
    (onClose: () => void) => {
      if (!problem) return;
      if (exportFormat === "yaml") {
        const yamlContent = `# Problem: ${problem.title}\n# Export not yet implemented`;
        const blob = new Blob([yamlContent], { type: "text/yaml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${problem.title.replace(/[^a-zA-Z0-9]/g, "_")}.yaml`;
        a.click();
        URL.revokeObjectURL(url);
        onClose();
        showToast({ kind: "success", title: "YAML exported" });
      } else {
        onClose();
        showToast({
          kind: "success",
          title: "PDF export",
          subtitle: `Coming soon (scale: ${pdfScale}%)`,
        });
      }
    },
    [problem, exportFormat, pdfScale, showToast],
  );

  if (isLoading) {
    return (
      <div className={styles.editorRoot}>
        <div className={styles.skeletonHeader}>
          <SkeletonText heading width="40%" />
        </div>
        <div className={styles.skeletonBody}>
          <SkeletonText paragraph lineCount={3} width="80%" />
          <SkeletonPlaceholder style={{ width: "100%", height: "12rem", marginTop: "1rem" }} />
          <div style={{ marginTop: "1rem" }}>
            <SkeletonText paragraph lineCount={2} width="60%" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !problem) {
    return (
      <div className={styles.emptyState}>
        <p>{error ? "Failed to load problem" : "Problem not found"}</p>
      </div>
    );
  }

  return (
    <MarkdownEditorProvider>
      <FormProvider {...methods}>
        <ProblemEditProvider problemId={problemId}>
          <EditorContent
            problem={problem}
            sectionsWithValidation={sectionsWithValidation}
            handleYAMLImport={handleYAMLImport}
            handleVisibilityChange={handleVisibilityChange}
            handleDelete={handleDelete}
            handleExportConfirm={handleExportConfirm}
            onProblemUpdated={handleProblemUpdated}
          />
        </ProblemEditProvider>
      </FormProvider>
    </MarkdownEditorProvider>
  );
};

/* ── Public API ─────────────────────────────────────────────── */

interface EmbeddedProblemEditorProps {
  problemId: string;
  contestId: string;
  onRemoved?: () => void;
}

const EmbeddedProblemEditor: React.FC<EmbeddedProblemEditorProps> = (props) => (
  <ProblemEditUIProvider>
    <EmbeddedEditorInner {...props} />
  </ProblemEditUIProvider>
);

export default EmbeddedProblemEditor;
