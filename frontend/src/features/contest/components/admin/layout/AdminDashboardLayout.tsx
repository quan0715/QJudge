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
  { labelKey: string; examLabelKey?: string; icon: typeof Dashboard }
> = {
  overview: { labelKey: "overview", icon: Dashboard },
  clarifications: { labelKey: "clarifications", icon: Chat },
  logs: { labelKey: "logs", icon: Activity },
  participants: { labelKey: "participants", icon: UserMultiple },
  problem_editor: {
    labelKey: "problemManagement",
    examLabelKey: "examManagement",
    icon: Education,
  },
  grading: {
    labelKey: "grading",
    examLabelKey: "examGrading",
    icon: TaskComplete,
  },
  statistics: {
    labelKey: "statistics",
    examLabelKey: "examStatistics",
    icon: ChartColumn,
  },
  settings: { labelKey: "settings", icon: Settings },
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
      <Header aria-label={t("adminLayout.title")} className={styles.header}>
        <HeaderName href="#" prefix={t("header.prefix", "QJudge")}>
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
              aria-label={t("adminLayout.header.exportFiles")}
              tooltipAlignment="end"
              onClick={onExport}
            >
              <DocumentDownload size={20} />
            </HeaderGlobalAction>
          )}
          {onPreview && (
            <HeaderGlobalAction
              aria-label={t("adminLayout.header.previewAnswer")}
              tooltipAlignment="end"
              onClick={onPreview}
            >
              <View size={20} />
            </HeaderGlobalAction>
          )}
          <HeaderGlobalAction
            aria-label={t("adminLayout.header.backToHome")}
            tooltipAlignment="end"
            onClick={onBack}
          >
            <Launch size={20} />
          </HeaderGlobalAction>
        </HeaderGlobalBar>
      </Header>

      <SideNav
        aria-label={t("header.adminNavigation")}
        isRail
        className={styles.sidenav}
      >
        <SideNavItems>
          {availablePanels.map((id) => {
            const item = NAV_ITEMS[id];
            if (!item) return null;
            const { labelKey, examLabelKey, icon: Icon } = item;
            const label =
              examMode && examLabelKey
                ? t(`adminLayout.nav.${examLabelKey}`)
                : t(`adminLayout.nav.${labelKey}`);
            return (
              <SideNavLink
                key={id}
                renderIcon={Icon}
                isActive={activePanel === id}
                onClick={() => onPanelChange(id)}
              >
                {label}
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
