import { useEffect, useRef, useState, type ReactNode } from "react";
import { HeaderGlobalAction, HeaderName } from "@carbon/react";
import {
  Dashboard,
  Bullhorn,
  Task,
  Trophy,
  UserMultiple,
  Settings,
  Launch,
  Renew,
  Switcher,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { UserMenu } from "@/features/app/components/UserMenu";
import AdminShellLayout, { type NavItem } from "@/shared/layout/AdminShellLayout";
import styles from "./ClassroomAdminLayout.module.scss";

export type ClassroomAdminPanelId =
  | "overview"
  | "announcements"
  | "practice"
  | "contests"
  | "members"
  | "settings";

interface ClassroomSwitcherItem {
  id: string;
  name: string;
}

interface ClassroomAdminLayoutProps {
  classroomName: string;
  activePanel: ClassroomAdminPanelId;
  availablePanels: ClassroomAdminPanelId[];
  classroomOptions: ClassroomSwitcherItem[];
  selectedClassroomId: string;
  onClassroomSwitch: (classroomId: string) => void;
  onPanelChange: (panel: ClassroomAdminPanelId) => void;
  onGoHome: () => void;
  onBack: () => void;
  onRefresh: () => void;
  children: ReactNode;
}

const NAV_ITEMS: Record<
  ClassroomAdminPanelId,
  { icon: typeof Dashboard; labelKey: string; fallback: string }
> = {
  overview: { icon: Dashboard, labelKey: "tab.overview", fallback: "Overview" },
  announcements: { icon: Bullhorn, labelKey: "announcements", fallback: "Announcements" },
  practice: { icon: Task, labelKey: "practice", fallback: "Practice" },
  contests: { icon: Trophy, labelKey: "contests", fallback: "Contests" },
  members: { icon: UserMultiple, labelKey: "members", fallback: "Members" },
  settings: { icon: Settings, labelKey: "tab.settings", fallback: "Settings" },
};

const ClassroomAdminLayout = ({
  classroomName,
  activePanel,
  availablePanels,
  classroomOptions,
  selectedClassroomId,
  onClassroomSwitch,
  onPanelChange,
  onGoHome,
  onBack,
  onRefresh,
  children,
}: ClassroomAdminLayoutProps) => {
  const { t } = useTranslation();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherHostRef = useRef<HTMLDivElement | null>(null);

  const selectedClassroom =
    classroomOptions.find((option) => option.id === selectedClassroomId) || null;

  useEffect(() => {
    if (!switcherOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (switcherHostRef.current?.contains(target)) return;
      setSwitcherOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSwitcherOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [switcherOpen]);

  const navItems: NavItem[] = availablePanels.map((panel) => {
    const navItem = NAV_ITEMS[panel];
    return {
      id: panel,
      icon: navItem.icon,
      label: t(`classroom.${navItem.labelKey}`, navItem.fallback),
      isActive: panel === activePanel,
      onClick: () => onPanelChange(panel),
    };
  });

  return (
    <AdminShellLayout
      headerAriaLabel={t("classroom.title", "教室管理")}
      headerLeft={
        <>
          <div className={styles.headerLeft}>
            <HeaderName
              href="#"
              prefix=""
              onClick={(event: React.MouseEvent) => {
                event.preventDefault();
                onGoHome();
              }}
              className={styles.brand}
            >
              QJudge
            </HeaderName>

            <div className={styles.switcherHost} ref={switcherHostRef}>
              <button
                type="button"
                className={styles.classroomTriggerButton}
                aria-haspopup="menu"
                aria-expanded={switcherOpen}
                aria-label={t("classroom.switchClassroom", "Switch classroom")}
                onClick={() => setSwitcherOpen((open) => !open)}
              >
                <span className={styles.classroomTriggerName}>
                  {selectedClassroom?.name ?? classroomName}
                </span>
                <Switcher size={16} className={styles.classroomTriggerIcon} />
              </button>

              <div
                className={`${styles.switcherMenu}${switcherOpen ? ` ${styles.switcherMenuOpen}` : ""}`}
                role="menu"
                aria-label={t("classroom.classroomList", "Classroom list")}
              >
                <div className={styles.switcherCardList}>
                  {classroomOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`${styles.switcherCard}${
                        option.id === selectedClassroomId ? ` ${styles.switcherCardActive}` : ""
                      }`}
                      onClick={() => {
                        setSwitcherOpen(false);
                        onClassroomSwitch(option.id);
                      }}
                    >
                      <span className={styles.switcherCardTitle}>{option.name}</span>
                      <span className={styles.switcherCardMeta}>
                        {option.id === selectedClassroomId
                          ? t("classroom.current", "目前教室")
                          : t("classroom.switchTo", "切換至此教室")}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className={styles.headerCenter} />
        </>
      }
      headerActions={
        <>
          <HeaderGlobalAction
            aria-label={t("common.refresh", "重新整理")}
            tooltipAlignment="end"
            onClick={onRefresh}
          >
            <Renew size={20} />
          </HeaderGlobalAction>
          <HeaderGlobalAction
            aria-label={t("common.backToClassrooms", "返回教室列表")}
            tooltipAlignment="end"
            onClick={onBack}
          >
            <Launch size={20} />
          </HeaderGlobalAction>
          <UserMenu />
        </>
      }
      sideNavAriaLabel={t("classroom.title", "教室管理")}
      sideNavMode={{ variant: "expanded", width: "16rem" }}
      headerZIndex={9500}
      className={styles.shell}
      contentClassName={styles.contentViewport}
      navItems={navItems}
    >
      {children}
    </AdminShellLayout>
  );
};

export default ClassroomAdminLayout;
