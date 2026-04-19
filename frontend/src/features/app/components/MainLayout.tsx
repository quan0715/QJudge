import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Content } from "@carbon/react";
import { AppSidebar } from "./AppSidebar";
import { SideMenu } from "./SideMenu";
import { SideMenuToggle } from "./SideMenuToggle";
import { useAppSidebar } from "@/features/app/contexts/AppSidebarContext";
import { WorkspaceShell } from "@/features/chatbot/components/workspace/WorkspaceShell";
import styles from "./MainLayout.module.scss";

const MainLayout = () => {
  const location = useLocation();
  const isChatPage = location.pathname.startsWith("/chat");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isOpen, open, close } = useAppSidebar();

  return (
    <div className={styles.root}>
      {/* Mobile-only top bar (hidden on desktop ≥ 769px) */}
      <div className={styles.mobileHeader}>
        <SideMenuToggle
          isOpen={mobileMenuOpen}
          onClick={() => setMobileMenuOpen(o => !o)}
        />
        <span className={styles.mobileBrand}>QJudge</span>
        <SideMenu
          isOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
        />
      </div>

      {/* App body */}
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
    </div>
  );
};

export default MainLayout;
