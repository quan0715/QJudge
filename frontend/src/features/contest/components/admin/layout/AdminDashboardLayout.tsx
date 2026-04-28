import { Link } from "react-router-dom";
import { Breadcrumb, BreadcrumbItem, HeaderGlobalAction } from "@carbon/react";
import { useTranslation } from "react-i18next";
import {
  Dashboard,
  Activity,
  UserMultiple,
  View,
  Education,
  Settings,
  TaskComplete,
  ChartColumn,
  Chat,
} from "@carbon/icons-react";
import type { ContestDetail } from "@/core/entities/contest.entity";
import type { AdminPanelId } from "@/features/contest/modules/types";
import { UserMenu } from "@/features/app/components/UserMenu";
import AdminShellLayout, { type NavItem } from "@/shared/layout/AdminShellLayout";

interface AdminDashboardLayoutProps {
  contestId: string;
  contestName: string;
  classroomId?: string;
  classroomName?: string;
  activePanel: AdminPanelId;
  availablePanels: AdminPanelId[];
  examMode?: boolean;
  contest?: ContestDetail | null;
  onPanelChange: (panel: AdminPanelId) => void;
  onRefresh?: () => void;
  onSettingsOpen?: () => void;
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
  proctoring: { labelKey: "proctoring", icon: View },
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
  "ai-grading": {
    labelKey: "aiGrading",
    examLabelKey: "examAiGrading",
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
  contest,
  onPanelChange,
  onRefresh,
  onSettingsOpen,
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
                  <Link to="/dashboard">{tc("nav.dashboard")}</Link>
                </BreadcrumbItem>
                <BreadcrumbItem>
                  {contestName}
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
          {onSettingsOpen && (
            <HeaderGlobalAction
              aria-label={t("adminLayout.nav.settings")}
              tooltipAlignment="end"
              onClick={onSettingsOpen}
            >
              <Settings size={20} />
            </HeaderGlobalAction>
          )}
          <UserMenu contestMode contest={contest} onContestRefresh={onRefresh} />
        </>
      }
      sideNavAriaLabel={t("common:header.adminNavigation")}
      sideNavMode={{ variant: "rail" }}
      navItems={navItems}
      enableAI
    >
      {children}
    </AdminShellLayout>
  );
}
