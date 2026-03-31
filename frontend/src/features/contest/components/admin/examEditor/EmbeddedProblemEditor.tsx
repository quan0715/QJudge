import React, { useEffect, useCallback, useMemo } from "react";
import { useForm, FormProvider, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { SkeletonText, SkeletonPlaceholder } from "@carbon/react";
import {
  patchProblem,
  deleteProblem,
} from "@/infrastructure/api/repositories/problem.repository";
import { getContestProblem } from "@/infrastructure/api/repositories/contestProblems.repository";
import { ProblemEditProvider } from "@/features/problems/contexts/ProblemEditContext";
import { MarkdownEditorProvider } from "@/shared/ui/markdown/markdownEditor";
import { CodingProblemEditorShell } from "@/features/problems/components";
import { useToast } from "@/shared/contexts";
import {
  DEFAULT_PROBLEM_FORM_VALUES,
  type ProblemFormSchema,
} from "@/features/problems/forms/problemFormSchema";
import { problemFormSchema } from "@/features/problems/forms/problemFormValidation";
import {
  yamlToFormSchema,
  formSchemaToApiPayload,
  problemDetailToFormSchema,
} from "@/features/problems/forms/problemFormAdapters";
import type { ProblemYAML } from "@/shared/utils/problemYamlParser";
import styles from "./EmbeddedProblemEditor.module.scss";

interface EmbeddedEditorInnerProps {
  contestProblemId: string;
  contestId: string;
  onRemoved?: () => void;
}

const EmbeddedEditorInner: React.FC<EmbeddedEditorInnerProps> = ({
  contestProblemId,
  contestId,
  onRemoved,
}) => {
  const { showToast } = useToast();

  const methods = useForm<ProblemFormSchema>({
    defaultValues: DEFAULT_PROBLEM_FORM_VALUES,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(problemFormSchema) as any,
    mode: "onBlur",
  });

  const { reset } = methods;
  const formValues = useWatch({ control: methods.control });

  const {
    data: problem,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["contestProblemEditor", contestId, contestProblemId],
    queryFn: async () => {
      const data = await getContestProblem(contestId, contestProblemId);
      return data || null;
    },
    enabled: !!contestId && !!contestProblemId,
    staleTime: 1000 * 60,
  });

  const formSchema = useMemo(
    () => problemDetailToFormSchema(problem),
    [problem]
  );

  useEffect(() => {
    if (!formSchema) return;
    reset(formSchema, { keepDefaultValues: false });
  }, [formSchema, reset]);

  const handleYAMLImport = useCallback(
    async (yamlData: ProblemYAML) => {
      const formData = yamlToFormSchema(yamlData);
      reset(formData, { keepDefaultValues: false });
      try {
        if (!problem?.id) {
          throw new Error("Problem adapter not found");
        }
        const apiPayload = formSchemaToApiPayload(formData);
        await patchProblem(problem.id, apiPayload);
        showToast({ kind: "success", title: "Import Success" });
      } catch (err) {
        showToast({
          kind: "warning",
          title: "Imported but auto-save failed",
          subtitle: err instanceof Error ? err.message : "Please save manually",
        });
      }
    },
    [problem?.id, reset, showToast],
  );

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
    ({
      exportFormat,
      pdfScale,
      close,
    }: {
      exportFormat: "pdf" | "yaml";
      pdfScale: number;
      close: () => void;
    }) => {
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
        close();
        showToast({ kind: "success", title: "YAML exported" });
      } else {
        close();
        showToast({
          kind: "success",
          title: "PDF export",
          subtitle: `Coming soon (scale: ${pdfScale}%)`,
        });
      }
    },
    [problem, showToast],
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
        <ProblemEditProvider problemId={problem.id}>
          <CodingProblemEditorShell
            title={problem.title || "Untitled"}
            formValues={formValues as ProblemFormSchema}
            onDelete={handleDelete}
            onImportYaml={handleYAMLImport}
            onExportConfirm={handleExportConfirm}
          />
        </ProblemEditProvider>
      </FormProvider>
    </MarkdownEditorProvider>
  );
};

interface EmbeddedProblemEditorProps {
  contestProblemId: string;
  contestId: string;
  onRemoved?: () => void;
}

const EmbeddedProblemEditor: React.FC<EmbeddedProblemEditorProps> = (props) => (
  <EmbeddedEditorInner {...props} />
);

export default EmbeddedProblemEditor;
