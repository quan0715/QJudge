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
import type { ContestProblemSummary } from "@/core/entities/contest.entity";
import CodingProblemPreviewCard from "./CodingProblemPreviewCard";
import CodingProblemTabbedEditor from "./CodingProblemTabbedEditor";
import styles from "./EmbeddedProblemEditor.module.scss";

interface EmbeddedProblemEditorProps {
  contestProblemId: string;
  contestId: string;
  orderLabel: string;
  contestBinding: Pick<ContestProblemSummary, "sourceBank" | "sourceMode">;
  score?: number;
  frozen?: boolean;
  onDelete?: () => Promise<void>;
  onDuplicate?: () => void | Promise<void>;
  onPointerDownDrag?: (e: React.PointerEvent) => void;
  onSaveToBankSuccess?: () => void | Promise<void>;
}

const EmbeddedProblemEditor: React.FC<EmbeddedProblemEditorProps> = ({
  contestProblemId,
  contestId,
  orderLabel,
  contestBinding,
  score,
  frozen = false,
  onDelete,
  onDuplicate,
  onPointerDownDrag,
  onSaveToBankSuccess,
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
        orderLabel={orderLabel}
        displayTitle={previewData.title || ""}
        score={score}
        problem={previewData}
        frozen={frozen}
        contestBinding={contestBinding}
        problemId={problem.id}
        onSaveToBankSuccess={() => void onSaveToBankSuccess?.()}
        onClick={() => setEditing(true)}
        onPointerDownDrag={onPointerDownDrag}
        onDuplicate={frozen ? undefined : onDuplicate}
        onDelete={frozen ? undefined : onDelete}
      />
    );
  }

  return (
    <div ref={editorRef}>
      <MarkdownEditorProvider>
        <FormProvider {...methods}>
          <ProblemEditProvider problemId={problem.id}>
            <CodingProblemTabbedEditor
              orderLabel={orderLabel}
              score={score}
              difficulty={problem.difficulty}
              frozen={frozen}
              contestBinding={contestBinding}
              problemId={problem.id}
              onSaveToBankSuccess={() => void onSaveToBankSuccess?.()}
              onDelete={frozen ? undefined : onDelete}
              onDuplicate={frozen ? undefined : onDuplicate}
              onPointerDownDrag={onPointerDownDrag}
            />
          </ProblemEditProvider>
        </FormProvider>
      </MarkdownEditorProvider>
    </div>
  );
};

export default EmbeddedProblemEditor;
