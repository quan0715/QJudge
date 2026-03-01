import {
  Header,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  SideNav,
  SideNavItems,
  SideNavLink,
} from "@carbon/react";
import {
  Dashboard,
  Activity,
  UserMultiple,
  Education,
  Settings,
  Launch,
  TaskComplete,
} from "@carbon/icons-react";
import styles from "./AdminDashboardLayout.module.scss";

type PanelId = "overview" | "logs" | "participants" | "exam" | "grading" | "settings";

interface AdminDashboardLayoutProps {
  contestName: string;
  activePanel: PanelId;
  examMode?: boolean;
  onPanelChange: (panel: PanelId) => void;
  onBack: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS: { id: PanelId; label: string; examLabel?: string; icon: typeof Dashboard }[] = [
  { id: "overview", label: "Overview", icon: Dashboard },
  { id: "logs", label: "Event Logs", icon: Activity },
  { id: "participants", label: "Participants", icon: UserMultiple },
  { id: "exam", label: "Problem Management", examLabel: "Exam Management", icon: Education },
  { id: "grading", label: "Grading", examLabel: "Exam Grading", icon: TaskComplete },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function AdminDashboardLayout({
  contestName,
  activePanel,
  examMode,
  onPanelChange,
  onBack,
  children,
}: AdminDashboardLayoutProps) {
  const fullBleed = activePanel === "exam" || activePanel === "grading";

  return (
    <div className={styles.layout}>
      <Header aria-label="Admin Dashboard" className={styles.header}>
        <HeaderName href="#" prefix="QJudge">
          {contestName}
        </HeaderName>
        <HeaderGlobalBar>
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
          {NAV_ITEMS.map(({ id, label, examLabel, icon: Icon }) => (
            <SideNavLink
              key={id}
              renderIcon={Icon}
              isActive={activePanel === id}
              onClick={() => onPanelChange(id)}
            >
              {examMode && examLabel ? examLabel : label}
            </SideNavLink>
          ))}
        </SideNavItems>
      </SideNav>

      <main className={`${styles.content} ${fullBleed ? styles.contentFullBleed : ""}`}>
        <div className={styles.contentInner}>{children}</div>
      </main>
    </div>
  );
}
