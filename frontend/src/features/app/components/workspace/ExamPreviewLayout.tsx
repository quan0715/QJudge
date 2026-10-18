import { Outlet } from "react-router-dom";
import { ContestProvider } from "@/features/contest/contexts/ContestContext";
import { WorkspaceShell } from "@/features/chatbot/components/workspace/WorkspaceShell";
import { ContestRuntimeNavigatorProvider } from "@/features/contest/contexts/ContestRuntimeNavigatorContext";
import { ContestJudgeQueueProvider } from "@/features/contest/contexts/ContestJudgeQueueProvider";
import styles from "./ExamPreviewLayout.module.scss";

export default function ExamPreviewLayout() {
  return (
    <ContestProvider>
      <ContestRuntimeNavigatorProvider>
        <ContestJudgeQueueProvider>
          <div className={styles.root}>
            <WorkspaceShell><div className={styles.content}><Outlet /></div></WorkspaceShell>
          </div>
        </ContestJudgeQueueProvider>
      </ContestRuntimeNavigatorProvider>
    </ContestProvider>
  );
}
