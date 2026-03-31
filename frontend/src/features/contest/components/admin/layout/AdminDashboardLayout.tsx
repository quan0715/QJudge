import { Link } from "react-router-dom";
import { Breadcrumb, BreadcrumbItem, HeaderGlobalAction } from "@carbon/react";
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
  Renew,
} from "@carbon/icons-react";
import type { AdminPanelId } from "@/features/contest/modules/types";
import AdminShellLayout, { type NavItem } from "@/shared/layout/AdminShellLayout";

interface AdminDashboardLayoutProps {
  contestId: string;
  contestName: string;
  classroomId?: string;
  classroomName?: string;
  activePanel: AdminPanelId;
  availablePanels: AdminPanelId[];
  examMode?: boolean;
  onPanelChange: (panel: AdminPanelId) => void;
  onBack: () => void;
  onRefresh?: () => void;
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
  contestId,
  contestName,
  classroomId,
  classroomName,
  activePanel,
  availablePanels,
  examMode,
  onPanelChange,
  onBack,
  onRefresh,
  onPreview,
  onExport,
  showExamJsonActions,
  onImportExamJson,
  children,
}: AdminDashboardLayoutProps) {
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");

  const navItems: NavItem[] = availablePanels.flatMap((id) => {
    const item = NAV_ITEMS[id];
    if (!item) return [];
    const { labelKey, examLabelKey, icon } = item;
    const label =
      examMode && examLabelKey
        ? t(`adminLayout.nav.${examLabelKey}`)
        : t(`adminLayout.nav.${labelKey}`);
    return [
      {
        id: id as string,
        icon,
        label,
        isActive: activePanel === id,
        onClick: () => onPanelChange(id),
      },
    ];
  });

  return (
    <AdminShellLayout
      headerAriaLabel={t("adminLayout.title")}
      headerLeft={
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
          <Link
            to="/dashboard"
            style={{
              color: "var(--cds-text-primary)",
              textDecoration: "none",
              fontSize: "0.875rem",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {t("common:header.prefix", "QJudge")}
          </Link>
          <Breadcrumb noTrailingSlash style={{ display: "inline-flex", alignItems: "center", margin: 0 }}>
            {classroomId ? (
              <>
                <BreadcrumbItem>
                  <Link to="/dashboard">{tc("nav.dashboard")}</Link>
                </BreadcrumbItem>
                <BreadcrumbItem>
                  <Link to={`/classrooms/${classroomId}`}>
                    {classroomName || tc("nav.classrooms", "教室")}
                  </Link>
                </BreadcrumbItem>
                <BreadcrumbItem>
                  <Link to={`/classrooms/${classroomId}/contest/${contestId}`}>
                    {contestName}
                  </Link>
                </BreadcrumbItem>
                <BreadcrumbItem isCurrentPage>
                  {t("adminLayout.title", "管理")}
                </BreadcrumbItem>
              </>
            ) : (
              <>
                <BreadcrumbItem>
                  <Link to="/contests">{tc("nav.contests")}</Link>
                </BreadcrumbItem>
                <BreadcrumbItem>
                  <Link to={`/contests/${contestId}`}>{contestName}</Link>
                </BreadcrumbItem>
                <BreadcrumbItem isCurrentPage>
                  {t("adminLayout.title", "管理")}
                </BreadcrumbItem>
              </>
            )}
          </Breadcrumb>
        </div>
      }
      headerActions={
        <>
          {onRefresh && (
            <HeaderGlobalAction
              aria-label={t("adminLayout.header.refresh")}
              tooltipAlignment="end"
              onClick={onRefresh}
            >
              <Renew size={20} />
            </HeaderGlobalAction>
          )}
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
        </>
      }
      sideNavAriaLabel={t("common:header.adminNavigation")}
      sideNavMode={{ variant: "rail" }}
      navItems={navItems}
    >
      {children}
    </AdminShellLayout>
  );
}
