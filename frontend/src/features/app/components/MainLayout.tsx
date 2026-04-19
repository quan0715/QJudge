import { Outlet, useLocation } from "react-router-dom";
import { Content } from "@carbon/react";
import { AppSidebar } from "./AppSidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { useAppSidebar } from "@/features/app/contexts/AppSidebarContext";
import { WorkspaceShell } from "@/features/chatbot/components/workspace/WorkspaceShell";
import styles from "./MainLayout.module.scss";

const MainLayout = () => {
  const location = useLocation();
  const isChatPage = location.pathname.startsWith("/chat");
  const { isOpen, open, close } = useAppSidebar();

  return (
    <div className={styles.root}>
      {/* App body (grows to fill space above the mobile bottom nav) */}
      <div className={styles.body}>
        <WorkspaceShell
          leftPanel={
            <AppSidebar
              collapsed={!isOpen}
              onToggleCollapse={close}
            />
          }
          leftPanelCollapsed={!isOpen}
          onExpandLeftPanel={open}
          disableRightPanel={isChatPage}
        >
          {isChatPage ? (
            <div style={{ flex: 1, height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <Outlet />
            </div>
          ) : (
            <Content style={{ height: "100%", overflow: "auto", marginTop: 0 }}>
              <Outlet />
            </Content>
          )}
        </WorkspaceShell>
      </div>

      {/* Mobile-only bottom navigation (hidden on desktop ≥ 769px) */}
      <MobileBottomNav />
    </div>
  );
};

export default MainLayout;
