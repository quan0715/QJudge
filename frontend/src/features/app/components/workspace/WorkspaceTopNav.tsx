import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { IconButton } from "@carbon/react";
import {
  ChevronDown,
  Education,
  Home,
  Locked,
  OpenPanelLeft,
  Settings,
  View,
  WarningAltFilled,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { BoundContest, Classroom, ClassroomDetail } from "@/core/entities/classroom.entity";
import { getClassroom, getClassrooms } from "@/infrastructure/api/repositories/classroom.repository";
import { getClassroomIcon } from "@/features/classroom/constants/classroomIcons";
import { getClassroomContestAdminPath, getClassroomContestDashboardPath } from "@/features/contest/domain/contestRoutePolicy";
import { shouldLockContestWorkspaceNavigation } from "@/features/contest/domain/contestRuntimePolicy";
import { usePageHeaderActionsSlot } from "@/features/app/contexts/PageHeaderActionsContext";
import { useWorkspace } from "@/features/app/contexts/WorkspaceContext";
import { UserMenu } from "@/features/app/components/UserMenu";
import { useContestRuntimeMode } from "@/features/contest/hooks";
import { useContest } from "@/features/contest/contexts/ContestContext";
import { useOptionalContest } from "@/features/contest/contexts";
import { useContestTimers } from "@/features/contest/hooks/useContestTimers";
import { ExamModeMonitorModal } from "@/features/contest/components/modals/ExamModeMonitorModal";
import { useExamMonitoringStatus } from "@/features/contest/contexts/ExamMonitoringStatusContext";
import { TimeDisplay } from "@/shared/components/dashboard";
import styles from "./WorkspaceTopNav.module.scss";

type MenuKind = "classroom" | "contest" | "contestMode" | null;

const getClassroomRouteId = (pathname: string): string | null => {
  if (pathname.startsWith("/classrooms/join")) return null;
  return pathname.match(/^\/classrooms\/([^/]+)/)?.[1] ?? null;
};

const getContestRouteContext = (
  pathname: string,
): { classroomId: string; contestId: string; admin: boolean } | null => {
  const match = pathname.match(/^\/classrooms\/([^/]+)\/contest\/([^/]+)(?:\/(admin))?/);
  if (!match) return null;
  return {
    classroomId: match[1],
    contestId: match[2],
    admin: match[3] === "admin",
  };
};

interface WorkspaceTopNavProps {
  showSidebarControl: boolean;
}

export function WorkspaceTopNav({ showSidebarControl }: WorkspaceTopNavProps) {
  const { t } = useTranslation("common");
  const { left } = useWorkspace();
  const pageHeaderActions = usePageHeaderActionsSlot();
  const location = useLocation();
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);

  const classroomId = useMemo(
    () => getClassroomRouteId(location.pathname),
    [location.pathname],
  );
  const contestContext = useMemo(
    () => getContestRouteContext(location.pathname),
    [location.pathname],
  );
  const contestRouteId = contestContext?.contestId ?? null;
  const isContestAdminRoute = contestContext?.admin ?? false;

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [classroomDetail, setClassroomDetail] = useState<ClassroomDetail | null>(null);
  const [openMenu, setOpenMenu] = useState<MenuKind>(null);

  useEffect(() => {
    let active = true;
    if (!classroomId) return;
    void getClassroom(classroomId).then((detail) => {
      if (!active) return;
      setClassroomDetail(detail ?? null);
    }).catch(() => {
      if (active) setClassroomDetail(null);
    });
    return () => {
      active = false;
    };
  }, [classroomId]);

  useEffect(() => {
    let active = true;
    if (!classroomId) return;
    void getClassrooms().then((rows) => {
      if (!active) return;
      setClassrooms(rows);
    }).catch(() => {
      if (active) setClassrooms([]);
    });
    return () => {
      active = false;
    };
  }, [classroomId]);

  useEffect(() => {
    if (!openMenu) return;
    const handlePointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [openMenu]);

  const currentClassroom = useMemo(
    () => {
      if (!classroomId) return null;
      if (classroomDetail?.id === classroomId) return classroomDetail;
      return classrooms.find((item) => item.id === classroomId) ?? null;
    },
    [classroomDetail, classrooms, classroomId],
  );

  const contests = useMemo(
    () => classroomDetail?.id === classroomId ? classroomDetail.contests : [],
    [classroomDetail, classroomId],
  );
  const currentContest = useMemo(
    () => contests.find((contest) => contest.contestId === contestRouteId) ?? null,
    [contests, contestRouteId],
  );

  const goToClassroom = useCallback((targetId: string) => {
    setOpenMenu(null);
    navigate(`/classrooms/${targetId}`);
  }, [navigate]);

  const goToContest = useCallback((contest: BoundContest) => {
    if (!classroomId) return;
    setOpenMenu(null);
    navigate(
      isContestAdminRoute
        ? getClassroomContestAdminPath(classroomId, contest.contestId)
        : getClassroomContestDashboardPath(classroomId, contest.contestId),
    );
  }, [classroomId, isContestAdminRoute, navigate]);

  const goToContestHome = useCallback(() => {
    if (!classroomId || !contestRouteId) return;
    setOpenMenu(null);
    navigate(getClassroomContestDashboardPath(classroomId, contestRouteId));
  }, [classroomId, contestRouteId, navigate]);

  const goToContestAdmin = useCallback(() => {
    if (!classroomId || !contestRouteId) return;
    setOpenMenu(null);
    navigate(getClassroomContestAdminPath(classroomId, contestRouteId));
  }, [classroomId, contestRouteId, navigate]);

  const { isRuntime } = useContestRuntimeMode();
  const contestData = useOptionalContest();
  const contestNavigationReadOnly =
    isRuntime || shouldLockContestWorkspaceNavigation(contestData?.contest);
  const effectiveOpenMenu = contestNavigationReadOnly ? null : openMenu;
  const toggleMenu = useCallback((kind: Exclude<MenuKind, null>) => {
    if (contestNavigationReadOnly) return;
    setOpenMenu((menu) => menu === kind ? null : kind);
  }, [contestNavigationReadOnly]);

  return (
    <header className={styles.root}>
      <div className={styles.left}>
        {showSidebarControl ? (
          <IconButton
            kind="ghost"
            size="md"
            align="bottom"
            label={t("workspaceTopNav.expandSidebar", "展開側欄")}
            onClick={left.open}
            className={styles.sidebarButton}
          >
            <OpenPanelLeft size={20} />
          </IconButton>
        ) : null}

        <nav
          className={styles.context}
          aria-label={t("workspaceTopNav.contextLabel", "Workspace context")}
          ref={menuRef}
        >
          {currentClassroom ? (
            <>
              <div className={styles.menuAnchor}>
                <button
                  type="button"
                  className={`${styles.contextLink}${contestNavigationReadOnly ? ` ${styles.contextLinkReadOnly}` : ""}`}
                  aria-haspopup={contestNavigationReadOnly ? undefined : "menu"}
                  aria-expanded={effectiveOpenMenu === "classroom"}
                  aria-disabled={contestNavigationReadOnly ? "true" : undefined}
                  onClick={() => toggleMenu("classroom")}
                >
                  {createElement(getClassroomIcon(currentClassroom.icon), { size: 18 })}
                  <span>{currentClassroom.name}</span>
                  {!contestNavigationReadOnly ? <ChevronDown size={14} /> : null}
                </button>
                {effectiveOpenMenu === "classroom" ? (
                  <div className={styles.menu} role="menu">
                    {classrooms.map((classroom) => {
                      return (
                        <button
                          key={classroom.id}
                          type="button"
                          role="menuitem"
                          className={`${styles.menuItem}${classroom.id === classroomId ? ` ${styles.menuItemActive}` : ""}`}
                          onClick={() => goToClassroom(classroom.id)}
                        >
                          {createElement(getClassroomIcon(classroom.icon), { size: 16 })}
                          <span>{classroom.name}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          {contestContext ? (
            <>
              {currentClassroom ? <span className={styles.separator}>/</span> : null}
              <div className={styles.menuAnchor}>
                <button
                  type="button"
                  className={`${styles.contextLink}${contestNavigationReadOnly ? ` ${styles.contextLinkReadOnly}` : ""}`}
                  aria-haspopup={contestNavigationReadOnly ? undefined : "menu"}
                  aria-expanded={effectiveOpenMenu === "contest"}
                  aria-disabled={contestNavigationReadOnly ? "true" : undefined}
                  onClick={() => toggleMenu("contest")}
                >
                  <span>
                    {currentContest?.contestName ??
                      t("workspaceTopNav.contestFallback", "Contest")}
                  </span>
                  {!contestNavigationReadOnly ? <ChevronDown size={14} /> : null}
                </button>
                {effectiveOpenMenu === "contest" ? (
                  <div className={styles.menu} role="menu">
                    {contests.map((contest) => (
                      <button
                        key={contest.contestId}
                        type="button"
                        role="menuitem"
                          className={`${styles.menuItem}${contest.contestId === contestRouteId ? ` ${styles.menuItemActive}` : ""}`}
                        onClick={() => goToContest(contest)}
                      >
                        <Education size={16} />
                        <span>{contest.contestName}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {isContestAdminRoute ? (
                <>
                  <span className={styles.separator}>/</span>
                  <div className={styles.menuAnchor}>
                    <button
                      type="button"
                      className={`${styles.contextLink}${contestNavigationReadOnly ? ` ${styles.contextLinkReadOnly}` : ""}`}
                      aria-haspopup={contestNavigationReadOnly ? undefined : "menu"}
                      aria-expanded={effectiveOpenMenu === "contestMode"}
                      aria-disabled={contestNavigationReadOnly ? "true" : undefined}
                      onClick={() => toggleMenu("contestMode")}
                    >
                      <span>{t("workspaceTopNav.adminConsole", "管理後台")}</span>
                      {!contestNavigationReadOnly ? <ChevronDown size={14} /> : null}
                    </button>
                    {effectiveOpenMenu === "contestMode" ? (
                      <div className={styles.menu} role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          className={styles.menuItem}
                          onClick={goToContestHome}
                        >
                          <Home size={16} />
                          <span>
                            {t("workspaceTopNav.contestHome", "競賽主頁")}
                          </span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className={`${styles.menuItem} ${styles.menuItemActive}`}
                          onClick={goToContestAdmin}
                        >
                          <Settings size={16} />
                          <span>
                            {t("workspaceTopNav.adminConsole", "管理後台")}
                          </span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </>
          ) : null}
        </nav>
      </div>

      <div className={styles.actions}>
        {isRuntime && <RuntimeNavExtras />}
        {pageHeaderActions}
        {!isRuntime ? <UserMenu /> : null}
      </div>
    </header>
  );
}

function RuntimeNavExtras() {
  const { t } = useTranslation("contest");
  const [monitoringOpen, setMonitoringOpen] = useState(false);
  const { contest, refreshContest } = useContest();
  const monitoringReminder = useExamMonitoringStatus();
  const { timeLeft, isCountdownToStart } = useContestTimers({
    contest,
    contestId: contest?.id,
    refreshContest,
  });

  if (!contest) return null;

  const monitoringLabel = monitoringReminder
    ? t(`exam.monitoringReminder.${monitoringReminder.source}`, {
        defaultValue: t("exam.monitoringIssueHint", "監控需處理"),
      })
    : contest.examStatus === "locked"
      ? t("exam.locked", "已鎖定")
      : contest.examStatus === "paused"
        ? t("exam.paused", "已暫停")
        : t("exam.monitoring", "監控中");
  const MonitoringIcon = monitoringReminder || contest.examStatus === "paused"
    ? WarningAltFilled
    : contest.examStatus === "locked"
      ? Locked
      : View;
  const monitoringToneClass =
    monitoringReminder?.tone === "critical" || contest.examStatus === "locked"
      ? styles.runtimeMonitoringCritical
      : monitoringReminder || contest.examStatus === "paused"
        ? styles.runtimeMonitoringWarning
        : styles.runtimeMonitoringNormal;

  return (
    <>
      {contest.cheatDetectionEnabled ? (
        <button
          type="button"
          className={`${styles.runtimeMonitoringMini} ${monitoringToneClass}`}
          onClick={() => setMonitoringOpen(true)}
          aria-label={monitoringLabel}
          title={[
            monitoringLabel,
            monitoringReminder?.countdownSeconds != null
              ? `${monitoringReminder.countdownSeconds}s`
              : null,
          ].filter(Boolean).join(" ")}
        >
          <MonitoringIcon size={20} />
          {monitoringReminder?.countdownSeconds != null ? (
            <span className={styles.runtimeMonitoringCountdown}>
              {monitoringReminder.countdownSeconds}s
            </span>
          ) : null}
        </button>
      ) : null}
      <div className={styles.runtimeTimer}>
        <TimeDisplay
          variant="header"
          value={
            isCountdownToStart
              ? t("answering.runtimeNav.startsIn", "{{time}} 後開始", { time: timeLeft })
              : timeLeft
          }
        />
      </div>
      <ExamModeMonitorModal
        open={monitoringOpen}
        onRequestClose={() => setMonitoringOpen(false)}
      />
    </>
  );
}
