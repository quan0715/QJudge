import { Outlet, useLocation, useOutletContext } from "react-router-dom";
import { Content } from "@carbon/react";
import { WorkspaceShell } from "@/features/chatbot/components/workspace/WorkspaceShell";
import styles from "./MainLayout.module.scss";

const MainLayout = () => {
  const location = useLocation();
  const outletContext = useOutletContext<unknown>();
  const isChatPage = location.pathname.startsWith("/chat");

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
              style={{
                height: "100%",
                minHeight: 0,
                overflow: "auto",
                marginTop: 0,
                display: "flex",
                flexDirection: "column",
              }}
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
