import { Outlet } from "react-router-dom";
import { ContestProvider } from "@/features/contest/contexts/ContestContext";
import { WorkspaceShell } from "@/features/chatbot/components/workspace/WorkspaceShell";
import { ContestRuntimeNavigatorProvider } from "@/features/contest/contexts/ContestRuntimeNavigatorContext";
import styles from "./ExamPreviewLayout.module.scss";

export default function ExamPreviewLayout() {
  return (
    <ContestProvider>
      <ContestRuntimeNavigatorProvider>
        <div className={styles.root}>
          <WorkspaceShell><div className={styles.content}><Outlet /></div></WorkspaceShell>
        </div>
      </ContestRuntimeNavigatorProvider>
    </ContestProvider>
  );
}
