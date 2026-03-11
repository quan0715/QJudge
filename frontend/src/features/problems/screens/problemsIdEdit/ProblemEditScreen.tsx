import React, { useRef, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import { useForm, FormProvider, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@carbon/react";
import { Upload, Download, View } from "@carbon/icons-react";
import type { ProblemDetail, ProblemVisibility } from "@/core/entities/problem.entity";
import {
  patchProblem,
  deleteProblem,
} from "@/infrastructure/api/repositories/problem.repository";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import {
  ProblemEditProvider,
  useProblemEdit,
} from "@/features/problems/contexts/ProblemEditContext";
import { MarkdownEditorProvider } from "@/shared/ui/markdown/markdownEditor";
import { TriggerModal, type TriggerModalHandle } from "@/shared/ui/modal";
import { ChatbotWidget } from "@/features/chatbot";
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
import ProblemEditHeader from "./components/ProblemEditHeader";
import ProblemEditSections from "./components/ProblemEditSections";
import ProblemEditPreviewModal from "./components/ProblemEditPreviewModal";
import ProblemEditExportModal from "./components/ProblemEditExportModal";
import {
  ProblemEditError,
  ProblemEditLoading,
  ProblemEditPermissionDenied,
} from "./components/ProblemEditState";
import {
  ProblemEditUIProvider,
  useProblemEditUI,
} from "./contexts/ProblemEditUIContext";
import {
  BASE_SECTIONS,
  getSectionValidationState,
} from "./utils/sectionConfig";
import { formSchemaToPreview } from "./utils/previewAdapter";
import type { NavSection } from "./section/layout";
import "./screen.scss";

interface ProblemEditScreenContentProps {
  problem: ProblemDetail;
  sectionsWithValidation: NavSection[];
  handleYAMLImport: (yamlData: ProblemYAML) => void;
  handleVisibilityChange: (visibility: ProblemVisibility) => Promise<void>;
  handleDelete: () => Promise<void>;
  handleExportConfirm: (onClose: () => void) => void;
  onBack: () => void;
  onProblemUpdated: () => void;
}

const ProblemEditScreenContent: React.FC<ProblemEditScreenContentProps> = ({
  problem,
  sectionsWithValidation,
  handleYAMLImport,
  handleVisibilityChange,
  handleDelete,
  handleExportConfirm,
  onBack,
  onProblemUpdated,
}) => {
  const { t } = useTranslation("problem");
  const { user } = useAuth();
  const { autoSave } = useProblemEdit();
  const { exportFormat, setExportFormat, pdfScale, setPdfScale } =
    useProblemEditUI();
  const { watch } = useFormContext<ProblemFormSchema>();
  const previewModalRef = useRef<TriggerModalHandle>(null);

  const watchedValues = watch();
  const previewData = useMemo(
    () => formSchemaToPreview(watchedValues),
    [watchedValues],
  );

  return (
    <div className="problem-edit-page">
      <ProblemEditHeader
        title={problem.title || t("edit.messages.loadFailed")}
        onBack={onBack}
        globalSaveStatus={<GlobalSaveStatus status={autoSave.globalStatus} />}
        actions={
          <>
            <TriggerModal
              trigger={
                <Button kind="ghost" renderIcon={Upload}>
                  {t("edit.actions.import")}
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
                <Button kind="ghost" renderIcon={Download}>
                  {t("edit.actions.export")}
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
              renderIcon={View}
              onClick={() => previewModalRef.current?.open()}
            >
              {t("edit.actions.preview")}
            </Button>
          </>
        }
      />

      <div className="problem-edit-page__main">
        <div className="problem-edit-page__content">
          <ProblemEditSections
            sections={sectionsWithValidation}
            onPreviewClick={() => previewModalRef.current?.open()}
            problemTitle={problem.title}
            visibility={watchedValues.visibility || 'private'}
            onVisibilityChange={handleVisibilityChange}
            onDelete={handleDelete}
          />
        </div>

        <ChatbotWidget
          defaultExpanded={false}
          problemContext={{
            id: problem.id,
            title: problem.title || "未命名題目",
          }}
          backgroundInfo={{
            user: user ? {
              username: user.username,
              role: user.role,
            } : undefined,
            problem: {
              id: problem.id,
              title: problem.title || "未命名題目",
              difficulty: watchedValues.difficulty,
            },
          }}
          onProblemUpdated={onProblemUpdated}
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

/**
 * ProblemEditPage - Full-screen problem editor with auto-save
 *
 * Features:
 * - Scroll-spy navigation
 * - Field-level auto-save (PATCH)
 * - Preview modal
 * - Danger Zone for delete/visibility
 */
const ProblemEditPageInner: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation("problem");
  const { user } = useAuth();
  const { showToast } = useToast();
  const { exportFormat, pdfScale } = useProblemEditUI();

  // Permission check
  const canEdit = user && (user.role === "admin" || user.role === "teacher");

  // Form setup with Zod validation
  const methods = useForm<ProblemFormSchema>({
    defaultValues: DEFAULT_PROBLEM_FORM_VALUES,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(problemFormSchema) as any,
    mode: "onBlur", // Validate on blur for better UX
  });

  const {
    reset,
    formState: { errors, touchedFields },
  } = methods;

  const { problem, formSchema, isLoading, error, refetch } = useProblemDetail(id, {
    scope: "manage",
  });

  // Agent commit 成功後重新載入題目資料（useEffect 會自動 reset form）
  const handleProblemUpdated = useCallback(() => {
    refetch();
  }, [refetch]);

  // Compute sections with validation state
  const sectionsWithValidation: NavSection[] = useMemo(() => {
    return BASE_SECTIONS.map((section) => {
      const { state, errorCount } = getSectionValidationState(
        section.id,
        errors as Record<string, unknown>,
        touchedFields as Record<string, unknown>,
      );
      return {
        ...section,
        validationState: state,
        errorCount,
      };
    });
  }, [errors, touchedFields]);

  // Reset form when problem data changes
  useEffect(() => {
    if (!formSchema) return;
    reset(formSchema, { keepDefaultValues: false });
  }, [formSchema, reset]);

  // Handle YAML import
  const handleYAMLImport = useCallback(
    async (yamlData: ProblemYAML) => {
      if (!id) return;

      const formData = yamlToFormSchema(yamlData);
      reset(formData, { keepDefaultValues: false });

      // Auto-save the imported data
      try {
        const apiPayload = formSchemaToApiPayload(formData);
        await patchProblem(id, apiPayload);
        showToast({
          kind: "success",
          title: t("edit.messages.importSuccess"),
          subtitle: t("edit.messages.importSuccessDetail"),
        });
      } catch (err) {
        showToast({
          kind: "warning",
          title: t("edit.messages.importSuccessSaveFailed"),
          subtitle: err instanceof Error ? err.message : t("button.save"),
        });
      }
    },
    [id, reset, showToast],
  );

  // Handle visibility change
  const handleVisibilityChange = async (newVisibility: ProblemVisibility) => {
    if (!problem) return;
    try {
      await patchProblem(problem.id, { visibility: newVisibility });
      methods.setValue("visibility", newVisibility);

      const labels = {
        public: t("edit.status.public"),
        private: t("edit.status.private"),
        hidden: t("edit.status.hidden")
      };

      showToast({
        kind: "success",
        title: labels[newVisibility],
      });
    } catch (err) {
      showToast({
        kind: "error",
        title: tc("message.error"),
        subtitle: err instanceof Error ? err.message : t("message.tryAdjustFilters"),
      });
      throw err;
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!problem) return;
    try {
      await deleteProblem(problem.id);
      showToast({
        kind: "success",
        title: t("edit.messages.deleteSuccess"),
        subtitle: t("edit.messages.deleteSuccessDetail"),
      });
      setTimeout(() => navigate("/problems"), 1000);
    } catch (err) {
      showToast({
        kind: "error",
        title: t("edit.messages.deleteFailed"),
        subtitle: err instanceof Error ? err.message : tc("message.error"),
      });
      throw err;
    }
  };

  // Handle export
  const handleExportConfirm = useCallback(
    (onClose: () => void) => {
      if (!problem) return;

      if (exportFormat === "yaml") {
        // YAML export
        // TODO: Implement proper YAML export with form data
        const yamlContent = `# Problem: ${problem.title}\n# Export not yet implemented`;
        const blob = new Blob([yamlContent], { type: "text/yaml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${problem.title.replace(/[^a-zA-Z0-9]/g, "_")}.yaml`;
        a.click();
        URL.revokeObjectURL(url);

        onClose();
        showToast({
          kind: "success",
          title: t("edit.messages.exportSuccess"),
          subtitle: t("edit.messages.exportSuccessDetail"),
        });
      } else {
        // PDF export
        // TODO: Implement PDF export with scale option
        onClose();
        showToast({
          kind: "success",
          title: "PDF Export",
          subtitle: `PDF export feature in development... (Scale: ${pdfScale}%)`,
        });
      }
    },
    [problem, exportFormat, pdfScale, showToast],
  );
  const header = (
    <ProblemEditHeader
      title={problem?.title || tc("message.loading")}
      onBack={() => navigate(-1)}
    />
  );

  // Permission denied
  if (!canEdit) {
    return (
      <ProblemEditPermissionDenied
        header={header}
        onBack={() => navigate(-1)}
      />
    );
  }

  // Loading state
  if (isLoading) {
    return <ProblemEditLoading header={header} />;
  }

  // Error state
  if (error || !problem) {
    return (
      <ProblemEditError
        header={header}
        message={error ? t("edit.messages.loadFailed") : t("edit.messages.notFound")}
        onBack={() => navigate(-1)}
      />
    );
  }

  return (
    <MarkdownEditorProvider>
      <FormProvider {...methods}>
        <ProblemEditProvider problemId={id || ""}>
          <ProblemEditScreenContent
            problem={problem}
            sectionsWithValidation={sectionsWithValidation}
            handleYAMLImport={handleYAMLImport}
            handleVisibilityChange={handleVisibilityChange}
            handleDelete={handleDelete}
            handleExportConfirm={handleExportConfirm}
            onBack={() => navigate(-1)}
            onProblemUpdated={handleProblemUpdated}
          />
        </ProblemEditProvider>
      </FormProvider>
    </MarkdownEditorProvider>
  );
};

const ProblemEditPage: React.FC = () => {
  return (
    <ProblemEditUIProvider>
      <ProblemEditPageInner />
    </ProblemEditUIProvider>
  );
};

export default ProblemEditPage;
