import React, { useRef, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import { useForm, FormProvider, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@carbon/react";
import { Download, View } from "@carbon/icons-react";
import type { ProblemDetail } from "@/core/entities/problem.entity";
import {
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
import { GlobalSaveStatus } from "@/features/problems/components/edit/common";
import { useProblemDetail } from "@/features/problems/hooks";
import { useToast } from "@/shared/contexts";
import {
  DEFAULT_PROBLEM_FORM_VALUES,
  type ProblemFormSchema,
} from "@/features/problems/forms/problemFormSchema";
import { problemFormSchema } from "@/features/problems/forms/problemFormValidation";
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
import { formSchemaToPreview } from "./utils/previewAdapter";
import "./screen.scss";

interface ProblemEditScreenContentProps {
  problem: ProblemDetail;
  handleDelete: () => Promise<void>;
  handleExportConfirm: (onClose: () => void) => void;
  onBack: () => void;
  onProblemUpdated: () => void;
}

const ProblemEditScreenContent: React.FC<ProblemEditScreenContentProps> = ({
  problem,
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
            problemTitle={problem.title}
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
 * - Danger Zone for delete
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

  const { reset } = methods;

  const { problem, formSchema, isLoading, error, refetch } = useProblemDetail(id, {
    scope: "manage",
  });

  // Agent commit 成功後重新載入題目資料（useEffect 會自動 reset form）
  const handleProblemUpdated = useCallback(() => {
    refetch();
  }, [refetch]);

  // Reset form when problem data changes
  useEffect(() => {
    if (!formSchema) return;
    reset(formSchema, { keepDefaultValues: false });
  }, [formSchema, reset]);

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
        subtitle:
          err instanceof Error
            ? err.message
            : t("message.error", {
                ns: "common",
                defaultValue: "錯誤",
              }),
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
      title={
        problem?.title ||
        t("message.loading", {
          ns: "common",
          defaultValue: "載入中...",
        })
      }
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
