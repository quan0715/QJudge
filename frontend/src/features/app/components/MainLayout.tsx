// frontend/src/features/app/components/MainLayout.tsx
import { Outlet, useLocation } from "react-router-dom";
import { Content } from "@carbon/react";
import { GlobalHeader } from "./GlobalHeader";
import { WorkspaceShell } from "@/features/chatbot/components/workspace/WorkspaceShell";

const MainLayout = () => {
  const location = useLocation();
  const isFullBleed = location.pathname === "/chat";

  return (
    <>
      <GlobalHeader />
      <div
        style={{
          display: "flex",
          height: "calc(100dvh - 48px)",
          marginTop: "48px",
          overflow: "hidden",
        }}
      >
        {isFullBleed ? (
          <div style={{
            flex: 1,
            overflow: "hidden",
            position: "relative",
            height: "100%",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}>
            <Outlet />
          </div>
        ) : (
          <WorkspaceShell>
            <Content style={{ flex: 1, overflow: "auto", marginTop: 0 }}>
              <Outlet />
            </Content>
          </WorkspaceShell>
        )}
      </div>
    </>
  );
};

export default MainLayout;
