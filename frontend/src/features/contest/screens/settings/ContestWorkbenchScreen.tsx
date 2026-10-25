import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import type { AdminPanelProps } from "@/features/contest/modules/types";
import { WorkbenchRailHeader } from "./workbench/WorkbenchRailHeader";
import { canGrade, resolveWorkbenchMode, type WorkbenchMode } from "./workbench/workbenchMode";
const ContestGradingWorkbenchScreen = lazy(()=>import("./ContestGradingWorkbenchScreen"));
export default function ContestWorkbenchScreen(props: AdminPanelProps) {
  const [params,setParams]=useSearchParams();
  if (!props.contest) return null;
  const mode=resolveWorkbenchMode(params,props.contest);
  const changeMode=(next:WorkbenchMode)=>setParams(prev=>{
    const query=new URLSearchParams(prev);query.set("workbench_mode",next);
    if(next==="edit"){query.delete("grading_question");query.delete("grading_student");}
    return query;
  });
  const header=<WorkbenchRailHeader mode={mode} gradeDisabled={!canGrade(props.contest)} onModeChange={changeMode} onPreview={props.onPreview}/>;
  return mode==="grade" ? <Suspense fallback={header}><ContestGradingWorkbenchScreen header={header}/></Suspense> : <aside>{header}</aside>;
}
