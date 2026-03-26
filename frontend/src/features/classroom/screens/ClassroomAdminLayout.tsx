import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Header,
  HeaderGlobalBar,
  HeaderGlobalAction,
  HeaderName,
} from "@carbon/react";
import {
  ChevronDown,
  Settings,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { UserMenu } from "@/features/app/components/UserMenu";
import styles from "./ClassroomAdminLayout.module.scss";

export type ClassroomAdminPanelId =
  | "overview"
  | "announcements"
  | "contests"
  | "members"
  | "settings";

interface ClassroomSwitcherItem {
  id: string;
  name: string;
}

interface ClassroomAdminLayoutProps {
  classroomName: string;
  classroomOptions: ClassroomSwitcherItem[];
  selectedClassroomId: string;
  onClassroomSwitch: (classroomId: string) => void;
  onGoHome: () => void;
  onOpenSettings?: () => void;
  children: ReactNode;
}

const ClassroomAdminLayout = ({
  classroomName,
  classroomOptions,
  selectedClassroomId,
  onClassroomSwitch,
  onGoHome,
  onOpenSettings,
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

  return (
    <div className={styles.shell}>
      <Header
        aria-label={t("classroom.title", "教室管理")}
        className={styles.header}
      >
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
              <span className={styles.classroomTriggerLabel}>
                {t("classroom.current", "目前教室")}
              </span>
              <span className={styles.classroomTriggerName}>
                {selectedClassroom?.name ?? classroomName}
              </span>
              <ChevronDown size={16} className={styles.classroomTriggerIcon} />
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

        <HeaderGlobalBar>
          {onOpenSettings && (
            <HeaderGlobalAction
              aria-label={t("classroom.tab.settings", "教室設定")}
              tooltipAlignment="end"
              onClick={onOpenSettings}
            >
              <Settings size={20} />
            </HeaderGlobalAction>
          )}
          <UserMenu compact />
        </HeaderGlobalBar>
      </Header>

      <main className={styles.content}>{children}</main>
    </div>
  );
};

export default ClassroomAdminLayout;
