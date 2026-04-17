import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  Header,
  HeaderGlobalBar,
  HeaderGlobalAction,
} from "@carbon/react";
import { Settings } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { UserMenu } from "@/features/app/components/UserMenu";
import { SideMenu } from "@/features/app/components/SideMenu";
import { SideMenuToggle } from "@/features/app/components/SideMenuToggle";
import { WorkspaceShell } from "@/features/chatbot/components/workspace/WorkspaceShell";
import styles from "./ClassroomAdminLayout.module.scss";

export type ClassroomAdminPanelId =
  | "overview"
  | "announcements"
  | "contests"
  | "members"
  | "settings";

interface ClassroomAdminLayoutProps {
  classroomName: string;
  classroomOptions: { id: string; name: string; icon?: string }[];
  selectedClassroomId: string;
  onClassroomSwitch: (classroomId: string) => void;
  onGoHome: () => void;
  onOpenSettings?: () => void;
  children: ReactNode;
}

const ClassroomAdminLayout = ({
  classroomName,
  onOpenSettings,
  children,
}: ClassroomAdminLayoutProps) => {
  const { t } = useTranslation("classroom");
  const { t: tc } = useTranslation("common");
  const [sideMenuOpen, setSideMenuOpen] = useState(false);

  return (
    <div className={styles.shell}>
      <Header
        aria-label={t("title", "教室管理")}
        className={styles.header}
      >
        <div className={styles.headerLeft}>
          <SideMenuToggle
            isOpen={sideMenuOpen}
            onClick={() => setSideMenuOpen((o) => !o)}
          />

          <Breadcrumb noTrailingSlash className={styles.breadcrumb}>
            <BreadcrumbItem>
              <Link to="/dashboard">{tc("nav.dashboard")}</Link>
            </BreadcrumbItem>
            <BreadcrumbItem isCurrentPage>
              {classroomName}
            </BreadcrumbItem>
          </Breadcrumb>
        </div>

        <HeaderGlobalBar>
          {onOpenSettings && (
            <HeaderGlobalAction
              aria-label={t("tab.settings", "教室設定")}
              data-testid="classroom-open-settings"
              tooltipAlignment="end"
              onClick={onOpenSettings}
            >
              <Settings size={20} />
            </HeaderGlobalAction>
          )}
          <UserMenu />
        </HeaderGlobalBar>

        <SideMenu
          isOpen={sideMenuOpen}
          onClose={() => setSideMenuOpen(false)}
        />
      </Header>

      <WorkspaceShell>
        <main className={styles.content}>{children}</main>
      </WorkspaceShell>
    </div>
  );
};

export default ClassroomAdminLayout;
