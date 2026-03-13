import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

export type ExamSubmissionStepId =
  | "checking"
  | "recording"
  | "uploading"
  | "finalizing";

export type ExamSubmissionStepStatus =
  | "pending"
  | "active"
  | "done"
  | "error";

export interface ExamSubmissionStep {
  id: ExamSubmissionStepId;
  label: string;
  status: ExamSubmissionStepStatus;
}

export interface ExamSubmissionProgressState {
  open: boolean;
  running: boolean;
  steps: ExamSubmissionStep[];
  errorMessage: string | null;
}

interface RunExamSubmissionProgressOptions {
  handlers?: Partial<Record<ExamSubmissionStepId, () => Promise<void>>>;
  minStepMs?: number;
  closeOnSuccess?: boolean;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

const STEP_IDS: ExamSubmissionStepId[] = [
  "checking",
  "recording",
  "uploading",
  "finalizing",
];

const DEFAULT_MIN_STEP_MS = 450;

export const useExamSubmissionProgress = () => {
  const { t } = useTranslation("contest");

  const createSteps = useCallback(
    (): ExamSubmissionStep[] => [
      {
        id: "checking",
        label: t("exam.submitProgress.checking", "正在檢查作答內容"),
        status: "pending",
      },
      {
        id: "recording",
        label: t("exam.submitProgress.recording", "正在記錄考試事件"),
        status: "pending",
      },
      {
        id: "uploading",
        label: t("exam.submitProgress.uploading", "正在上傳螢幕截圖資料"),
        status: "pending",
      },
      {
        id: "finalizing",
        label: t("exam.submitProgress.finalizing", "正在完成交卷"),
        status: "pending",
      },
    ],
    [t],
  );

  const [state, setState] = useState<ExamSubmissionProgressState>({
    open: false,
    running: false,
    steps: createSteps(),
    errorMessage: null,
  });

  const reset = useCallback(() => {
    setState({
      open: false,
      running: false,
      steps: createSteps(),
      errorMessage: null,
    });
  }, [createSteps]);

  const close = useCallback(() => {
    setState((prev) =>
      prev.running
        ? prev
        : {
            ...prev,
            open: false,
            errorMessage: null,
            steps: createSteps(),
          },
    );
  }, [createSteps]);

  const updateStep = useCallback((stepId: ExamSubmissionStepId, status: ExamSubmissionStepStatus) => {
    setState((prev) => ({
      ...prev,
      steps: prev.steps.map((step) =>
        step.id === stepId ? { ...step, status } : step
      ),
    }));
  }, []);

  const run = useCallback(
    async ({
      handlers,
      minStepMs = DEFAULT_MIN_STEP_MS,
      closeOnSuccess = true,
    }: RunExamSubmissionProgressOptions = {}) => {
      setState({
        open: true,
        running: true,
        steps: createSteps(),
        errorMessage: null,
      });

      try {
        for (const stepId of STEP_IDS) {
          updateStep(stepId, "active");

          const startedAt = Date.now();
          const handler = handlers?.[stepId];
          if (handler) {
            await handler();
          }
          const elapsed = Date.now() - startedAt;
          if (elapsed < minStepMs) {
            await sleep(minStepMs - elapsed);
          }

          updateStep(stepId, "done");
        }

        setState((prev) => ({
          ...prev,
          running: false,
        }));

        if (closeOnSuccess) {
          await sleep(250);
          setState({
            open: false,
            running: false,
            steps: createSteps(),
            errorMessage: null,
          });
        }

        return true;
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : t("exam.submitProgress.failed", "交卷流程失敗，請再試一次");

        setState((prev) => {
          const activeStep = prev.steps.find((step) => step.status === "active");
          return {
            ...prev,
            running: false,
            errorMessage: message,
            steps: activeStep
              ? prev.steps.map((step) =>
                  step.id === activeStep.id
                    ? { ...step, status: "error" }
                    : step
                )
              : prev.steps,
          };
        });
        return false;
      }
    },
    [createSteps, t, updateStep],
  );

  return useMemo(
    () => ({
      state,
      run,
      close,
      reset,
    }),
    [close, reset, run, state],
  );
};

export default useExamSubmissionProgress;
