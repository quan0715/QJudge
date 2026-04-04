import React, { useEffect, useMemo, useState, useRef } from "react";
import { useForm, FormProvider, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { SkeletonText, SkeletonPlaceholder } from "@carbon/react";
import { getContestProblem } from "@/infrastructure/api/repositories/contestProblems.repository";
import { ProblemEditProvider } from "@/features/problems/contexts/ProblemEditContext";
import { MarkdownEditorProvider } from "@/shared/ui/markdown/markdownEditor";
import {
  DEFAULT_PROBLEM_FORM_VALUES,
  type ProblemFormSchema,
} from "@/features/problems/forms/problemFormSchema";
import { problemFormSchema } from "@/features/problems/forms/problemFormValidation";
import { problemDetailToFormSchema } from "@/features/problems/forms/problemFormAdapters";
import { formSchemaToPreview } from "@/features/problems/screens/problemsIdEdit/utils/previewAdapter";
import "@/features/problems/screens/problemsIdEdit/screen.scss";
import CodingProblemPreviewCard from "./CodingProblemPreviewCard";
import CodingProblemTabbedEditor from "./CodingProblemTabbedEditor";
import styles from "./EmbeddedProblemEditor.module.scss";

interface EmbeddedProblemEditorProps {
  contestProblemId: string;
  contestId: string;
  label?: string;
  score?: number;
  frozen?: boolean;
  onDelete?: () => Promise<void>;
  onPointerDownDrag?: (e: React.PointerEvent) => void;
}

const EmbeddedProblemEditor: React.FC<EmbeddedProblemEditorProps> = ({
  contestProblemId,
  contestId,
  label,
  score,
  frozen = false,
  onDelete,
  onPointerDownDrag,
}) => {
  const [editing, setEditing] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

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

  // Click outside to exit editing
  useEffect(() => {
    if (!editing) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (editorRef.current && !editorRef.current.contains(e.target as Node)) {
        setEditing(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  });

  // Escape to exit editing
  useEffect(() => {
    if (!editing) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditing(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  });

  const previewData = useMemo(
    () => formSchemaToPreview(formValues as ProblemFormSchema),
    [formValues]
  );

  if (isLoading) {
    return (
      <div className={styles.editorRoot}>
        <div className={styles.skeletonHeader}>
          <SkeletonText heading width="40%" />
        </div>
        <div className={styles.skeletonBody}>
          <SkeletonText paragraph lineCount={3} width="80%" />
          <SkeletonPlaceholder style={{ width: "100%", height: "6rem", marginTop: "0.5rem" }} />
        </div>
      </div>
    );
  }

  if (error || !problem) {
    return null;
  }

  if (!editing) {
    return (
      <CodingProblemPreviewCard
        label={label}
        score={score}
        problem={previewData}
        frozen={frozen}
        onClick={() => setEditing(true)}
        onPointerDownDrag={onPointerDownDrag}
      />
    );
  }

  return (
    <div ref={editorRef}>
      <MarkdownEditorProvider>
        <FormProvider {...methods}>
          <ProblemEditProvider problemId={problem.id}>
            <CodingProblemTabbedEditor
              label={label}
              title={problem.title || "Untitled"}
              score={score}
              difficulty={problem.difficulty}
              onDelete={frozen ? undefined : onDelete}
              onPointerDownDrag={onPointerDownDrag}
            />
          </ProblemEditProvider>
        </FormProvider>
      </MarkdownEditorProvider>
    </div>
  );
};

export default EmbeddedProblemEditor;
