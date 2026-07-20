import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Dashboard,
  Education,
  Checkmark,
  Globe,
  Chat as ChatIcon,
  AiLabel,
  Bullhorn,
  ChartColumn,
  TaskComplete,
  Trophy,
  UserMultiple,
  View,
  Settings,
  Home,
} from "@carbon/icons-react";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { getClassrooms } from "@/infrastructure/api/repositories/classroom.repository";
import { getContest } from "@/infrastructure/api/repositories/contest.repository";
import { getClassroomIcon } from "@/features/classroom/constants/classroomIcons";
import type { Classroom } from "@/core/entities/classroom.entity";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { useCopilotSessions } from "@copilot";
import { ChatHistoryPanel } from "@/features/chatbot/components/chat-ui/ChatHistoryPanel";
import { useOptionalContest } from "@/features/contest/contexts";
import { getClassroomContestDashboardPath } from "@/features/contest/domain/contestRoutePolicy";
import { shouldLockContestWorkspaceNavigation } from "@/features/contest/domain/contestRuntimePolicy";
import { useContestRuntimeMode } from "@/features/contest/hooks";
import { getContestTypeModule } from "@/features/contest/modules/registry";
import type { AdminPanelId } from "@/features/contest/modules/types";
import type { ClassroomAdminPanelId } from "@/features/classroom/screens/ClassroomAdminLayout";
import SideMenuContestIdleSection from "./SideMenuContestIdleSection";
import SideMenuContestRuntimeSection from "./SideMenuContestRuntimeSection";
import "./SideMenu.scss";

type ContestPanelNavItem = {
  panel: AdminPanelId;
  label: string;
  Icon: ComponentType<{ size?: number }>;
};

const CONTEST_PANEL_META: Record<
  AdminPanelId,
  { labelKey: string; examLabelKey?: string; Icon: ComponentType<{ size?: number }> }
> = {
  overview: { labelKey: "overview", Icon: Dashboard },
  clarifications: { labelKey: "clarifications", Icon: ChatIcon },
  proctoring: { labelKey: "proctoring", Icon: View },
  problem_editor: { labelKey: "problemManagement", examLabelKey: "examManagement", Icon: Education },
  grading: { labelKey: "grading", examLabelKey: "examGrading", Icon: TaskComplete },
  "ai-grading": { labelKey: "aiGrading", examLabelKey: "examAiGrading", Icon: AiLabel },
  statistics: { labelKey: "statistics", examLabelKey: "examStatistics", Icon: ChartColumn },
  settings: { labelKey: "settings", Icon: Settings },
};

const getClassroomAvatarInitial = (name: string): string => {
  const trimmed = name.trim();
  return (trimmed[0] ?? "?").toUpperCase();
};

interface SideMenuProps {
  isOpen?: boolean;
  onClose?: () => void;
  variant?: "drawer" | "panel";
  compact?: boolean;
}

export const SideMenu: React.FC<SideMenuProps> = ({
  isOpen = false,
  onClose,
  variant = "drawer",
  compact = false,
}) => {
  const isPanelMode = variant === "panel";
  const { t } = useTranslation("common");
  const { t: tClassroom } = useTranslation("classroom");
  const { t: tContest } = useTranslation("contest");
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const drawerRef = useRef<HTMLElement | null>(null);
  const [, startTransition] = useTransition();

  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "admin";

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [fetched, setFetched] = useState(false);
  const [contestForNav, setContestForNav] = useState<ContestDetail | null>(null);
  const [contestFetched, setContestFetched] = useState(false);
  const {
    sessions,
    activeSession,
    create: createSession,
    select: selectSession,
    rename: renameSession,
    remove: removeSession,
    refresh: refreshSessions,
  } = useCopilotSessions();

  const classroomId = useMemo(() => {
    const match = location.pathname.match(/^\/classrooms\/([^/]+)/);
    return match?.[1];
  }, [location.pathname]);
  const contestAdminContext = useMemo(() => {
    const match = location.pathname.match(
      /^\/classrooms\/([^/]+)\/contest\/([^/]+)\/admin(?:\/.*)?$/,
    );
    if (!match) return null;
    return { classroomId: match[1], contestId: match[2] };
  }, [location.pathname]);

  const contestMatch = useMemo(() => {
    const m = location.pathname.match(/^\/classrooms\/([^/]+)\/contest\/([^/]+)/);
    return m ? { classroomId: m[1], contestId: m[2] } : null;
  }, [location.pathname]);

  const contestIdToFetch = contestAdminContext?.contestId ?? contestMatch?.contestId ?? null;
  const contestContext = useOptionalContest();
  const contextContestForNav =
    contestContext?.contest?.id === contestIdToFetch ? contestContext.contest : null;
  const effectiveContestForNav = contextContestForNav ?? contestForNav;

  const { isRuntime } = useContestRuntimeMode();
  const hideClassroomBack =
    isRuntime || shouldLockContestWorkspaceNavigation(effectiveContestForNav);

  const inContestIdle = !!contestMatch && !contestAdminContext && !isRuntime;
  const inContestRuntime = !!contestMatch && isRuntime;

  const activeProblemId = useMemo(() => {
    const m = location.pathname.match(/\/solve\/([^/]+)/);
    return m?.[1];
  }, [location.pathname]);

  // Route-aware: show classroom workspace panel when on a classroom route
  const isOnClassroomRoute = Boolean(classroomId);
  const isChatRoute = location.pathname === "/chat" || location.pathname.startsWith("/chat/");
  const currentSessionId = activeSession.id;

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const classroomRows = await getClassrooms();
      startTransition(() => {
        setClassrooms(classroomRows);
        setFetched(true);
      });
    } catch {
      startTransition(() => { setFetched(true); });
    }
  }, [user]);

  useEffect(() => {
    if ((isPanelMode || isOpen) && !isChatRoute && !fetched) void fetchData();
  }, [isPanelMode, isOpen, isChatRoute, fetched, fetchData]);

  // Also fetch when entering classroom route (panel mode always visible)
  useEffect(() => {
    if (isOnClassroomRoute && !fetched) void fetchData();
  }, [isOnClassroomRoute, fetched, fetchData]);

  useEffect(() => {
    if ((isPanelMode || isOpen) && isChatRoute && isTeacherOrAdmin) {
      void refreshSessions();
    }
  }, [isPanelMode, isOpen, isChatRoute, isTeacherOrAdmin, refreshSessions]);

  useEffect(() => {
    setContestForNav(null);
    setContestFetched(false);
  }, [contestIdToFetch]);

  useEffect(() => {
    if (!contestIdToFetch || contestFetched || contextContestForNav) return;
    let active = true;
    const loadContest = async () => {
      try {
        const contest = await getContest(contestIdToFetch);
        if (!active) return;
        setContestForNav(contest ?? null);
      } finally {
        if (active) {
          setContestFetched(true);
        }
      }
    };
    void loadContest();
    return () => {
      active = false;
    };
  }, [contestIdToFetch, contestFetched, contextContestForNav]);

  useEffect(() => {
    if (isPanelMode || !isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (drawerRef.current?.contains(target)) return;
      const toggle = document.querySelector(`[data-side-menu-toggle]`);
      if (toggle?.contains(target)) return;
      onClose?.();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isPanelMode, isOpen, onClose]);

  const go = useCallback((path: string) => { onClose?.(); navigate(path); }, [onClose, navigate]);

  const isActive = (prefix: string) => location.pathname.startsWith(prefix);

  const goToChatSession = useCallback(
    (id: string, options?: { replace?: boolean }) => {
      const search = new URLSearchParams();
      search.set("ai_session_id", id);
      navigate(
        { pathname: "/chat", search: `?${search.toString()}` },
        { replace: options?.replace ?? false },
      );
    },
    [navigate],
  );

  const handleNewChat = useCallback(async () => {
    const newSessionId = await createSession();
    if (!newSessionId) return;
    onClose?.();
    goToChatSession(newSessionId);
  }, [createSession, onClose, goToChatSession]);

  const handleSelectSession = useCallback((id: string) => {
    void selectSession(id);
    onClose?.();
    goToChatSession(id);
  }, [selectSession, onClose, goToChatSession]);

  const handleDeleteSession = useCallback(async (id: string) => {
    try {
      const result = await removeSession(id);
      if (!result.ok) return;
      if (id === currentSessionId) {
        if (result.activeSessionId) {
          goToChatSession(result.activeSessionId, { replace: true });
        } else {
          navigate("/chat", { replace: true });
        }
      }
    } catch {
      // silently ignore
    }
  }, [removeSession, currentSessionId, goToChatSession, navigate]);

  const handleRenameSession = useCallback(async (id: string, title: string) => {
    try {
      const result = await renameSession(id, title);
      if (!result.ok) return;
    } catch {
      // silently ignore
    }
  }, [renameSession]);

  // Classroom panel computed values
  const currentClassroom = useMemo(
    () => classrooms.find(c => c.id === classroomId),
    [classrooms, classroomId]
  );

  const canOpenClassroomSettings = useMemo(() => {
    const role = currentClassroom?.currentUserRole;
    return (
      role === "platform_admin" || role === "owner" || role === "manager"
    );
  }, [currentClassroom?.currentUserRole]);

  const classroomActivePanel = useMemo(() => {
    const p = new URLSearchParams(location.search).get("panel") || "overview";
    return p as ClassroomAdminPanelId;
  }, [location.search]);
  const contestActivePanel = useMemo(() => {
    const p = new URLSearchParams(location.search).get("panel") || "overview";
    return p as AdminPanelId;
  }, [location.search]);

  const contestPanelNavItems = useMemo<ContestPanelNavItem[]>(() => {
    if (!contestAdminContext) return [];
    const module = getContestTypeModule(effectiveContestForNav?.contestType);
    const isExamMode = module.admin.editorKind === "paper_exam";
    const panels = Array.from(new Set<AdminPanelId>([
      ...module.admin.getAvailablePanels(effectiveContestForNav),
      "settings",
    ]));
    return panels.flatMap((panel) => {
      const meta = CONTEST_PANEL_META[panel];
      if (!meta) return [];
      const labelKey = isExamMode && meta.examLabelKey ? meta.examLabelKey : meta.labelKey;
      return [{
        panel,
        label: tContest(`adminLayout.nav.${labelKey}`),
        Icon: meta.Icon,
      }];
    });
  }, [contestAdminContext, effectiveContestForNav, tContest]);

  const goToPanel = useCallback((panel: string) => {
    navigate(`/classrooms/${classroomId}?panel=${panel}`);
  }, [navigate, classroomId]);
  const goToContestPanel = useCallback((panel: AdminPanelId) => {
    if (!contestAdminContext) return;
    navigate(`/classrooms/${contestAdminContext.classroomId}/contest/${contestAdminContext.contestId}/admin?panel=${panel}`);
  }, [navigate, contestAdminContext]);
  const goToContestHome = useCallback(() => {
    if (!contestAdminContext) return;
    go(getClassroomContestDashboardPath(contestAdminContext.classroomId, contestAdminContext.contestId));
  }, [contestAdminContext, go]);
  const showContestAdminMiniNav = compact && Boolean(contestAdminContext);
  const homeLabel = t("nav.home", "Home");
  const contestHomeLabel = tContest("adminLayout.header.backToHome", "前往競賽主頁");

  return (
    <>
      {/* Drawer backdrop (drawer mode only) */}
      {!isPanelMode && (
        <div
          className={`side-menu-backdrop${isOpen ? " side-menu-backdrop--visible" : ""}`}
          aria-hidden="true"
        />
      )}
      <nav
        ref={drawerRef}
        className={[
          "side-menu",
          isPanelMode ? "side-menu--panel" : isOpen ? "side-menu--open" : "",
          compact ? "side-menu--mini" : "",
        ].filter(Boolean).join(" ")}
        aria-label={t("header.sideNav", "Side navigation")}
      >
        {inContestRuntime && contestMatch ? (
          <SideMenuContestRuntimeSection
            classroomId={contestMatch.classroomId}
            contestId={contestMatch.contestId}
            activeProblemId={activeProblemId}
            compact={compact}
            problems={effectiveContestForNav?.problems ?? []}
          />
        ) : inContestIdle && contestMatch ? (
          <SideMenuContestIdleSection
            classroomId={contestMatch.classroomId}
            contestId={contestMatch.contestId}
            compact={compact}
            hideClassroomBack={hideClassroomBack}
          />
        ) : (
          <>
            {showContestAdminMiniNav && (
              <div className="side-menu__section">
                {contestPanelNavItems.map(({ panel, label, Icon }) => (
                  <button
                    key={panel}
                    type="button"
                    title={label}
                    aria-label={label}
                    className={`side-menu__link${contestActivePanel === panel ? " side-menu__link--active" : ""}`}
                    onClick={() => goToContestPanel(panel)}
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            )}

            {!showContestAdminMiniNav && (
              isChatRoute && isTeacherOrAdmin ? (
                <>
                  <div className="side-menu__section">
                    <button
                      type="button"
                      title={homeLabel}
                      aria-label={homeLabel}
                      className={`side-menu__link${isActive("/dashboard") ? " side-menu__link--active" : ""}`}
                      onClick={() => go("/dashboard")}
                    >
                      <Home size={16} />
                      <span>{homeLabel}</span>
                    </button>
                    <button
                      type="button"
                      title={t("nav.chat", "Chat")}
                      aria-label={t("nav.chat", "Chat")}
                      className="side-menu__link side-menu__link--active"
                      onClick={() => go("/chat")}
                    >
                      <ChatIcon size={16} />
                      <span>{t("nav.chat", "Chat")}</span>
                    </button>
                  </div>
                  <div className="side-menu__chat-panel">
                    <ChatHistoryPanel
                      sessions={sessions}
                      currentSessionId={currentSessionId}
                      onSelectSession={handleSelectSession}
                      onDeleteSession={handleDeleteSession}
                      onRenameSession={handleRenameSession}
                      showNewChatButton
                      onNewChat={handleNewChat}
                    />
                  </div>
                </>
              ) : isOnClassroomRoute ? (
                /* Inside a classroom: global links + panel sub-nav */
                <>
                  <div className="side-menu__section">
                    <button
                      type="button"
                      title={homeLabel}
                      aria-label={homeLabel}
                      className={`side-menu__link${isActive("/dashboard") ? " side-menu__link--active" : ""}`}
                      onClick={() => go("/dashboard")}
                    >
                      <Home size={16} />
                      <span>{homeLabel}</span>
                    </button>
                    {isTeacherOrAdmin && (
                      <button
                        type="button"
                        title={t("nav.chat", "Chat")}
                        aria-label={t("nav.chat", "Chat")}
                        className={`side-menu__link${isActive("/chat") ? " side-menu__link--active" : ""}`}
                        onClick={() => go("/chat")}
                      >
                        <ChatIcon size={16} />
                        <span>{t("nav.chat", "Chat")}</span>
                      </button>
                    )}
                    {isTeacherOrAdmin && (
                      <button
                        type="button"
                        title={t("nav.marketplace", "Marketplace")}
                        aria-label={t("nav.marketplace", "Marketplace")}
                        className={`side-menu__link${isActive("/marketplace") ? " side-menu__link--active" : ""}`}
                        onClick={() => go("/marketplace")}
                      >
                        <Globe size={16} />
                        <span>{t("nav.marketplace", "Marketplace")}</span>
                      </button>
                    )}
                  </div>
                  <div className="side-menu__divider" />
                  <div className="side-menu__section">
                    {contestAdminContext ? (
                      contestPanelNavItems.map(({ panel, label, Icon }) => (
                        <button
                          key={panel}
                          type="button"
                          title={label}
                          aria-label={label}
                          className={`side-menu__link${contestActivePanel === panel ? " side-menu__link--active" : ""}`}
                          onClick={() => goToContestPanel(panel)}
                        >
                          <Icon size={16} />
                          <span>{label}</span>
                        </button>
                      ))
                    ) : (
                      ([
                        { panel: "overview", label: tClassroom("sideMenu.overview", "概要"), Icon: Dashboard },
                        { panel: "announcements", label: tClassroom("sideMenu.announcements", "教室公告"), Icon: Bullhorn },
                        { panel: "contests", label: tClassroom("sideMenu.contests", "競賽列表"), Icon: Trophy },
                        { panel: "members", label: tClassroom("sideMenu.members", "教室成員"), Icon: UserMultiple },
                        ...(canOpenClassroomSettings
                          ? ([
                              {
                                panel: "settings" as const,
                                label: tClassroom("sideMenu.settings", "教室設定"),
                                Icon: Settings,
                              },
                            ] as const)
                          : []),
                      ] as { panel: ClassroomAdminPanelId; label: string; Icon: ComponentType<{ size?: number }> }[]).map(({ panel, label, Icon }) => (
                        <button
                          key={panel}
                          type="button"
                          title={label}
                          aria-label={label}
                          className={`side-menu__link${classroomActivePanel === panel ? " side-menu__link--active" : ""}`}
                          onClick={() => goToPanel(panel)}
                        >
                          <Icon size={16} />
                          <span>{label}</span>
                        </button>
                      ))
                    )}
                  </div>
                </>
              ) : (
                /* Default classrooms list */
                <>
                  <div className="side-menu__section">
                    <button
                      type="button"
                      title={homeLabel}
                      aria-label={homeLabel}
                      className={`side-menu__link${isActive("/dashboard") ? " side-menu__link--active" : ""}`}
                      onClick={() => go("/dashboard")}
                    >
                      <Home size={16} />
                      <span>{homeLabel}</span>
                    </button>
                    {isTeacherOrAdmin && (
                      <button
                        type="button"
                        title={t("nav.chat", "Chat")}
                        aria-label={t("nav.chat", "Chat")}
                        className={`side-menu__link${isActive("/chat") ? " side-menu__link--active" : ""}`}
                        onClick={() => go("/chat")}
                      >
                        <ChatIcon size={16} />
                        <span>{t("nav.chat", "Chat")}</span>
                      </button>
                    )}
                    {isTeacherOrAdmin && (
                      <button
                        type="button"
                        title={t("nav.marketplace", "Marketplace")}
                        aria-label={t("nav.marketplace", "Marketplace")}
                        className={`side-menu__link${isActive("/marketplace") ? " side-menu__link--active" : ""}`}
                        onClick={() => go("/marketplace")}
                      >
                        <Globe size={16} />
                        <span>{t("nav.marketplace", "Marketplace")}</span>
                      </button>
                    )}
                  </div>
                  {classrooms.length > 0 && (
                    <>
                      <div className="side-menu__divider" />
                      <div className="side-menu__section">
                        <div className="side-menu__section-header">
                          <span>{t("nav.classrooms")}</span>
                        </div>
                        <div className="side-menu__classroom-list">
                          {classrooms.map((c) => {
                            const isCurrent = c.id === classroomId;
                            const Icon = getClassroomIcon(c.icon);
                            const avatarInitial = getClassroomAvatarInitial(c.name);
                            return (
                              <button
                                key={c.id}
                                type="button"
                                title={c.name}
                                aria-label={c.name}
                                className={`side-menu__classroom${isCurrent ? " side-menu__classroom--active" : ""}`}
                                onClick={() => go(`/classrooms/${c.id}`)}
                              >
                                {compact ? (
                                  <div className="side-menu__classroom-avatar" aria-hidden="true">
                                    {avatarInitial}
                                  </div>
                                ) : (
                                  <Icon size={16} />
                                )}
                                <span className="side-menu__classroom-name">{c.name}</span>
                                {isCurrent && <Checkmark size={16} className="side-menu__classroom-check" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </>
              )
            )}
            {contestAdminContext && (
              <div className="side-menu__bottom">
                <button
                  type="button"
                  title={contestHomeLabel}
                  aria-label={contestHomeLabel}
                  className="side-menu__link"
                  onClick={goToContestHome}
                >
                  <Education size={16} />
                  <span>{contestHomeLabel}</span>
                </button>
              </div>
            )}
          </>
        )}
      </nav>
    </>
  );
};

export default SideMenu;
