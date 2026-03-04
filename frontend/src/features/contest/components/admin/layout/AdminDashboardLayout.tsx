import {
  Header,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  SideNav,
  SideNavItems,
  SideNavLink,
} from "@carbon/react";
import { useTranslation } from "react-i18next";
import {
  Dashboard,
  Activity,
  UserMultiple,
  Education,
  Settings,
  Launch,
  TaskComplete,
  ChartColumn,
  Chat,
  View,
  DocumentDownload,
  Upload,
} from "@carbon/icons-react";
import type { AdminPanelId } from "@/features/contest/modules/types";
import styles from "./AdminDashboardLayout.module.scss";

interface AdminDashboardLayoutProps {
  contestName: string;
  activePanel: AdminPanelId;
  availablePanels: AdminPanelId[];
  examMode?: boolean;
  onPanelChange: (panel: AdminPanelId) => void;
  onBack: () => void;
  onPreview?: () => void;
  onExport?: () => void;
  showExamJsonActions?: boolean;
  onImportExamJson?: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS: Record<
  AdminPanelId,
  { label: string; examLabel?: string; icon: typeof Dashboard }
> = {
  overview: { label: "Overview", icon: Dashboard },
  clarifications: { label: "Q&A", icon: Chat },
  logs: { label: "Event Logs", icon: Activity },
  participants: { label: "Participants", icon: UserMultiple },
  problem_editor: {
    label: "Problem Management",
    examLabel: "Exam Management",
    icon: Education,
  },
  grading: { label: "Grading", examLabel: "Exam Grading", icon: TaskComplete },
  statistics: { label: "Statistics", examLabel: "Exam Statistics", icon: ChartColumn },
  settings: { label: "Settings", icon: Settings },
};

export default function AdminDashboardLayout({
  contestName,
  activePanel,
  availablePanels,
  examMode,
  onPanelChange,
  onBack,
  onPreview,
  onExport,
  showExamJsonActions,
  onImportExamJson,
  children,
}: AdminDashboardLayoutProps) {
  const { t } = useTranslation("contest");

  return (
    <div className={styles.layout}>
      <Header aria-label="Admin Dashboard" className={styles.header}>
        <HeaderName href="#" prefix="QJudge">
          {contestName}
        </HeaderName>
        <HeaderGlobalBar>
          {showExamJsonActions && onImportExamJson && (
            <HeaderGlobalAction
              aria-label={t("examJson.importAction")}
              tooltipAlignment="end"
              onClick={onImportExamJson}
            >
              <Upload size={20} />
            </HeaderGlobalAction>
          )}
          {onExport && (
            <HeaderGlobalAction
              aria-label="匯出檔案"
              tooltipAlignment="end"
              onClick={onExport}
            >
              <DocumentDownload size={20} />
            </HeaderGlobalAction>
          )}
          {onPreview && (
            <HeaderGlobalAction
              aria-label="預覽作答畫面"
              tooltipAlignment="end"
              onClick={onPreview}
            >
              <View size={20} />
            </HeaderGlobalAction>
          )}
          <HeaderGlobalAction
            aria-label="前往競賽主頁"
            tooltipAlignment="end"
            onClick={onBack}
          >
            <Launch size={20} />
          </HeaderGlobalAction>
        </HeaderGlobalBar>
      </Header>

      <SideNav
        aria-label="Admin navigation"
        isRail
        className={styles.sidenav}
      >
        <SideNavItems>
          {availablePanels.map((id) => {
            const item = NAV_ITEMS[id];
            if (!item) return null;
            const { label, examLabel, icon: Icon } = item;
            return (
              <SideNavLink
                key={id}
                renderIcon={Icon}
                isActive={activePanel === id}
                onClick={() => onPanelChange(id)}
              >
                {examMode && examLabel ? examLabel : label}
              </SideNavLink>
            );
          })}
        </SideNavItems>
      </SideNav>

      <main className={styles.content}>
        <div className={styles.contentViewport}>{children}</div>
      </main>
    </div>
  );
}
