import { Outlet, useLocation, useOutletContext } from "react-router-dom";
import { Content } from "@carbon/react";
import { WorkspaceShell } from "@/features/chatbot/components/workspace/WorkspaceShell";
import { ExamWorkspaceShell } from "@/features/contest/components/layout/ExamWorkspaceShell";
import styles from "./MainLayout.module.scss";

const MainLayout = () => {
  const location = useLocation();
  const outletContext = useOutletContext<unknown>();
  const isChatPage = location.pathname.startsWith("/chat");

  const examRoute = /^\/classrooms\/[^/]+\/contest\/[^/]+(\/solve(?:\/[^/]+)?)?\/?$/.exec(location.pathname);
  if (examRoute) return <ExamWorkspaceShell key={examRoute[1] ? "solve" : "overview"} dashboard={!examRoute[1]}><Outlet context={outletContext} /></ExamWorkspaceShell>;

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <WorkspaceShell>
          {isChatPage ? (
            <div style={{ flex: 1, height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <Outlet context={outletContext} />
            </div>
          ) : (
            <Content
              className={styles.content}
            >
              <Outlet context={outletContext} />
            </Content>
          )}
        </WorkspaceShell>
      </div>
    </div>
  );
};

export default MainLayout;
