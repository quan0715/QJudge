import { lazy, Suspense, useCallback, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { AdminPanelProps } from "@/features/contest/modules/types";
import { WorkbenchRailHeader } from "./workbench/WorkbenchRailHeader";
import {
  canGrade,
  resolveWorkbenchMode,
  type WorkbenchMode,
} from "./workbench/workbenchMode";
const WorkbenchEditScreen = lazy(
  () => import("./workbench/edit/WorkbenchEditScreen"),
);
const CodingTestEditorLayout = lazy(
  () => import("@/features/contest/components/admin/examEditor/CodingTestEditorLayout"),
);
const ContestGradingWorkbenchScreen = lazy(
  () => import("./ContestGradingWorkbenchScreen"),
);
export default function ContestWorkbenchScreen(props: AdminPanelProps) {
  const [params, setParams] = useSearchParams();
  const beforeLeave = useRef<(() => Promise<void>) | null>(null);
  const [modeAttempt, setModeAttempt] = useState(0);
  const registerBeforeLeave = useCallback((flush: (() => Promise<void>) | null) => {
    beforeLeave.current = flush;
  }, []);
  if (!props.contest) return null;
  const coding = props.contest.contestType === "coding";
  const mode = coding ? "edit" : resolveWorkbenchMode(params, props.contest);
  const changeMode = async (next: WorkbenchMode) => {
    if (next === mode) return;
    try {
      if (mode === "edit") await beforeLeave.current?.();
    } catch {
      // Keep the editor and its failed or invalid draft mounted.
      setModeAttempt((attempt) => attempt + 1);
      return;
    }
    setParams((prev) => {
      const query = new URLSearchParams(prev);
      query.set("workbench_mode", next);
      if (next === "edit") {
        query.delete("grading_question");
        query.delete("grading_student");
      }
      return query;
    });
  };
  const header = (
    <WorkbenchRailHeader
      key={modeAttempt}
      mode={mode}
      editOnly={coding}
      gradeDisabled={!canGrade(props.contest)}
      onModeChange={changeMode}
      onPreview={props.onPreview}
      onExport={props.onExport}
    />
  );
  if (coding) return (
    <Suspense fallback={header}>
      <CodingTestEditorLayout key={props.contestId} contestId={props.contestId} contest={props.contest} header={header} />
    </Suspense>
  );
  return mode === "grade" ? (
    <Suspense fallback={header}>
      <ContestGradingWorkbenchScreen header={header} />
    </Suspense>
  ) : (
    <Suspense fallback={header}>
      <WorkbenchEditScreen
        key={props.contestId}
        header={header}
        onPreview={props.onPreview}
        registerBeforeLeave={registerBeforeLeave}
      />
    </Suspense>
  );
}
