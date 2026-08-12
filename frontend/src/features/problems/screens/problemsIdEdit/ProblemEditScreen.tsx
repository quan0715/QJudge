import React, { useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import { useForm, FormProvider, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@carbon/react";
import { View } from "@carbon/icons-react";
import type { CodingProblemDetail } from "@/core/entities/problem.entity";
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
import { GlobalSaveStatus } from "@/shared/ui/autoSave";
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
import {
  ProblemEditError,
  ProblemEditLoading,
  ProblemEditPermissionDenied,
} from "./components/ProblemEditState";
import { formSchemaToPreview } from "./utils/previewAdapter";
import "./screen.scss";

interface ProblemEditScreenContentProps {
  problem: CodingProblemDetail;
  handleDelete: () => Promise<void>;
  onBack: () => void;
}

const ProblemEditScreenContent: React.FC<ProblemEditScreenContentProps> = ({
  problem,
  handleDelete,
  onBack,
}) => {
  const { t } = useTranslation("problem");
  const { autoSave } = useProblemEdit();
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
          <Button
            kind="secondary"
            renderIcon={View}
            onClick={() => previewModalRef.current?.open()}
          >
            {t("edit.actions.preview")}
          </Button>
        }
      />

      <div className="problem-edit-page__main">
        <div className="problem-edit-page__content">
          <ProblemEditSections
            problemTitle={problem.title}
            onDelete={handleDelete}
          />
        </div>

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
const ProblemEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation("problem");
  const { user } = useAuth();
  const { showToast } = useToast();

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

  const { problem, formSchema, isLoading, error } = useProblemDetail(id, {
    scope: "manage",
  });

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
      setTimeout(() => navigate("/dashboard"), 1000);
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
            onBack={() => navigate(-1)}
          />
        </ProblemEditProvider>
      </FormProvider>
    </MarkdownEditorProvider>
  );
};

export default ProblemEditPage;
