import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Dashboard,
  Education,
  Book,
  Checkmark,
  Globe,
  Chat as ChatIcon,
  Activity,
  Bullhorn,
  ChartColumn,
  TaskComplete,
  Trophy,
  UserMultiple,
  ChevronDown,
  Settings,
} from "@carbon/icons-react";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { getClassrooms } from "@/infrastructure/api/repositories/classroom.repository";
import { getContest } from "@/infrastructure/api/repositories/contest.repository";
import { getQuestionBanks as listMyBanks } from "@/infrastructure/api/repositories/questionBank.repository";
import { getClassroomIcon } from "@/features/classroom/constants/classroomIcons";
import type { Classroom } from "@/core/entities/classroom.entity";
import type { ContestDetail } from "@/core/entities/contest.entity";
import type { QuestionBank } from "@/core/entities/question-bank.entity";
import { useChatSessionContext } from "@/features/chatbot/contexts/ChatSessionContext";
import { useAiSessionParam } from "@/features/chatbot/lib/aiSessionUrl";
import { useOptionalChatbotContext } from "@/features/chatbot/contexts/ChatbotProvider";
import { chatbotRepository } from "@/infrastructure/api/repositories";
import { ChatHistoryPanel } from "@/features/chatbot/components/chat-ui/ChatHistoryPanel";
import { getContestTypeModule } from "@/features/contest/modules/registry";
import type { AdminPanelId } from "@/features/contest/modules/types";
import type { ClassroomAdminPanelId } from "@/features/classroom/screens/ClassroomAdminLayout";
import "./SideMenu.scss";

type TabKey = "classrooms" | "banks" | "chat";

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
  logs: { labelKey: "logs", Icon: Activity },
  participants: { labelKey: "participants", Icon: UserMultiple },
  problem_editor: { labelKey: "problemManagement", examLabelKey: "examManagement", Icon: Education },
  grading: { labelKey: "grading", examLabelKey: "examGrading", Icon: TaskComplete },
  "ai-grading": { labelKey: "aiGrading", examLabelKey: "examAiGrading", Icon: TaskComplete },
  statistics: { labelKey: "statistics", examLabelKey: "examStatistics", Icon: ChartColumn },
  settings: { labelKey: "settings", Icon: Settings },
};

function getDefaultTab(pathname: string): TabKey {
  if (pathname.startsWith("/classrooms")) return "classrooms";
  if (pathname.startsWith("/question-banks")) return "banks";
  if (pathname.startsWith("/chat")) return "chat";
  return "classrooms";
}

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

  const [activeTab, setActiveTab] = useState<TabKey>(() => getDefaultTab(location.pathname));
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [fetched, setFetched] = useState(false);
  const [contestForAdminNav, setContestForAdminNav] = useState<ContestDetail | null>(null);
  const [contestFetched, setContestFetched] = useState(false);

  const { sessions, refreshSessions } = useChatSessionContext();
  const chatbot = useOptionalChatbotContext();
  const { aiSessionId, setAiSessionId } = useAiSessionParam();

  // 當前 session id 直接看 URL query（全站 source of truth）。若 URL 還沒
  // 帶 param（例如剛進來 /chat 還沒同步完），fallback 到 chatbot 的內部狀態
  // 避免 highlight 閃爍。
  const currentSessionId = aiSessionId ?? chatbot?.currentSessionId ?? null;

  useEffect(() => {
    setActiveTab(getDefaultTab(location.pathname));
  }, [location.pathname]);

  useEffect(() => {
    if ((isPanelMode || isOpen) && activeTab === "chat" && isTeacherOrAdmin) {
      void refreshSessions();
    }
  }, [isPanelMode, isOpen, activeTab, isTeacherOrAdmin, refreshSessions]);

  const classroomId = useMemo(() => {
    const match = location.pathname.match(/^\/classrooms\/([^/]+)/);
    return match?.[1];
  }, [location.pathname]);
  const contestAdminContext = useMemo(() => {
    const match = location.pathname.match(/^\/classrooms\/([^/]+)\/contest\/([^/]+)\/admin\/?$/);
    if (!match) return null;
    return { classroomId: match[1], contestId: match[2] };
  }, [location.pathname]);

  const bankId = useMemo(() => {
    const match = location.pathname.match(/^\/question-banks\/([^/]+)/);
    return match?.[1];
  }, [location.pathname]);

  // Route-aware: show classroom workspace panel when on a classroom route
  const isOnClassroomRoute = Boolean(classroomId) && !location.pathname.startsWith("/classrooms/join");

  // Classroom switcher dropdown state
  const [classroomDropdownOpen, setClassroomDropdownOpen] = useState(false);
  const classroomDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!classroomDropdownOpen) return;
    const handle = (e: MouseEvent) => {
      if (!classroomDropdownRef.current?.contains(e.target as Node)) {
        setClassroomDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [classroomDropdownOpen]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const classroomRows = await getClassrooms();
      let bankRows: QuestionBank[] = [];
      if (isTeacherOrAdmin) bankRows = await listMyBanks();
      startTransition(() => {
        setClassrooms(classroomRows);
        setBanks(bankRows);
        setFetched(true);
      });
    } catch {
      startTransition(() => { setFetched(true); });
    }
  }, [user, isTeacherOrAdmin]);

  useEffect(() => {
    if ((isPanelMode || isOpen) && !fetched) void fetchData();
  }, [isPanelMode, isOpen, fetched, fetchData]);

  // Also fetch when entering classroom route (panel mode always visible)
  useEffect(() => {
    if (isOnClassroomRoute && !fetched) void fetchData();
  }, [isOnClassroomRoute, fetched, fetchData]);

  useEffect(() => {
    setContestForAdminNav(null);
    setContestFetched(false);
  }, [contestAdminContext?.contestId]);

  useEffect(() => {
    if (!contestAdminContext?.contestId || contestFetched) return;
    let active = true;
    const loadContest = async () => {
      try {
        const contest = await getContest(contestAdminContext.contestId);
        if (!active) return;
        setContestForAdminNav(contest ?? null);
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
  }, [contestAdminContext?.contestId, contestFetched]);

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

  // 統一的 session 切換：若不在 /chat 路由，用 navigate 把路由 + query 一起換；
  // 在 /chat 路由內則只動 query（不 unmount Provider，避免重 init）。
  const goToChatSession = useCallback(
    (id: string | null, options?: { replace?: boolean }) => {
      const onChatRoute = location.pathname === "/chat" || location.pathname.startsWith("/chat/");
      if (onChatRoute) {
        setAiSessionId(id, { replace: options?.replace ?? false });
        return;
      }
      const search = id ? `?ai_session_id=${encodeURIComponent(id)}` : "";
      navigate(`/chat${search}`, { replace: options?.replace });
    },
    [location.pathname, navigate, setAiSessionId],
  );

  const handleNewChat = useCallback(async () => {
    const newSessionId = chatbot
      ? await chatbot.createSession()
      : (await chatbotRepository.createSession()).id;
    onClose?.();
    // chatbot.createSession 會把 currentSessionId 設成新 id，Provider 的 URL
    // sync effect 會自動寫回 query。但若目前不在 /chat 路由，仍要切路由過去。
    goToChatSession(newSessionId ?? null);
  }, [chatbot, onClose, goToChatSession]);

  const handleSelectSession = useCallback((id: string) => {
    onClose?.();
    goToChatSession(id);
  }, [onClose, goToChatSession]);

  const handleDeleteSession = useCallback(async (id: string) => {
    try {
      if (chatbot) {
        await chatbot.deleteSession(id);
      } else {
        await chatbotRepository.deleteSession(id);
      }
      void refreshSessions();
      if (id === currentSessionId) {
        const remaining = sessions.filter((s) => s.id !== id);
        // chatbot.deleteSession 內部已切到下一個 / 新建 session 並改 currentSessionId，
        // Provider 的 effect 會把 URL query 同步過去。這裡只負責在需要時切路由。
        const nextId = remaining[0]?.id ?? null;
        goToChatSession(nextId, { replace: true });
      }
    } catch {
      // silently ignore
    }
  }, [chatbot, currentSessionId, sessions, refreshSessions, goToChatSession]);

  const handleRenameSession = useCallback(async (id: string, title: string) => {
    try {
      if (chatbot) {
        await chatbot.renameSession(id, title);
      } else {
        await chatbotRepository.renameSession(id, title);
      }
      void refreshSessions();
    } catch {
      // silently ignore
    }
  }, [chatbot, refreshSessions]);

  const tabs = useMemo(
    () =>
      (
        [
          { key: "classrooms" as TabKey, label: t("nav.classrooms"), Icon: Education, show: true },
          { key: "banks" as TabKey, label: t("nav.questionBanks"), Icon: Book, show: isTeacherOrAdmin },
          { key: "chat" as TabKey, label: t("nav.chat"), Icon: ChatIcon, show: isTeacherOrAdmin },
        ] as { key: TabKey; label: string; Icon: ComponentType<{ size?: number }>; show: boolean }[]
      ).filter((tab) => tab.show),
    [t, isTeacherOrAdmin],
  );

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
    const module = getContestTypeModule(contestForAdminNav?.contestType);
    const isExamMode = module.admin.editorKind === "paper_exam";
    const panels = Array.from(new Set<AdminPanelId>([
      ...module.admin.getAvailablePanels(contestForAdminNav),
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
  }, [contestAdminContext, contestForAdminNav, tContest]);

  const goToPanel = useCallback((panel: string) => {
    navigate(`/classrooms/${classroomId}?panel=${panel}`);
  }, [navigate, classroomId]);
  const goToContestPanel = useCallback((panel: AdminPanelId) => {
    if (!contestAdminContext) return;
    navigate(`/classrooms/${contestAdminContext.classroomId}/contest/${contestAdminContext.contestId}/admin?panel=${panel}`);
  }, [navigate, contestAdminContext]);

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
        {/* ── Tab bar — always visible ── */}
        <div className="side-menu__tabs" role="tablist">
          {tabs.map(({ key, label, Icon }) => {
            const isActiveTab = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isActiveTab}
                title={!isActiveTab ? label : undefined}
                className={`side-menu__tab${isActiveTab ? " side-menu__tab--active" : ""}`}
                onClick={() => setActiveTab(key)}
              >
                <Icon size={16} />
                {isActiveTab && <span className="side-menu__tab-label">{label}</span>}
              </button>
            );
          })}
        </div>

        {/* ── Classrooms tab ── */}
        {activeTab === "classrooms" && (
          isOnClassroomRoute ? (
            /* Inside a classroom: global links + workspace selector + panel sub-nav */
            <>
              <div className="side-menu__section">
                <button
                  type="button"
                  className={`side-menu__link${isActive("/dashboard") ? " side-menu__link--active" : ""}`}
                  onClick={() => go("/dashboard")}
                >
                  <Dashboard size={16} />
                  <span>{t("nav.dashboard")}</span>
                </button>
                {isTeacherOrAdmin && (
                  <button
                    type="button"
                    className={`side-menu__link${isActive("/marketplace") ? " side-menu__link--active" : ""}`}
                    onClick={() => go("/marketplace")}
                  >
                    <Globe size={16} />
                    <span>{t("nav.marketplace", "Marketplace")}</span>
                  </button>
                )}
              </div>
              <div className="side-menu__divider" />
              <div className="side-menu__workspace" ref={classroomDropdownRef}>
                <button
                  type="button"
                  className="side-menu__workspace-trigger"
                  onClick={() => setClassroomDropdownOpen(v => !v)}
                >
                  {(() => {
                    const Icon = currentClassroom?.icon ? getClassroomIcon(currentClassroom.icon) : Education;
                    return <Icon size={18} className="side-menu__workspace-icon" />;
                  })()}
                  <span className="side-menu__workspace-name">
                    {currentClassroom?.name ?? t("nav.classrooms")}
                  </span>
                  <ChevronDown size={14} className={`side-menu__workspace-chevron${classroomDropdownOpen ? " side-menu__workspace-chevron--open" : ""}`} />
                </button>
                {classroomDropdownOpen && (
                  <div className="side-menu__workspace-dropdown">
                    {classrooms.map(c => {
                      const Icon = c.icon ? getClassroomIcon(c.icon) : Education;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={`side-menu__workspace-option${c.id === classroomId ? " side-menu__workspace-option--active" : ""}`}
                          onClick={() => { setClassroomDropdownOpen(false); navigate(`/classrooms/${c.id}`); }}
                        >
                          <Icon size={16} />
                          <span>{c.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="side-menu__section">
                {contestAdminContext ? (
                  contestPanelNavItems.map(({ panel, label, Icon }) => (
                    <button
                      key={panel}
                      type="button"
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
                  className={`side-menu__link${isActive("/dashboard") ? " side-menu__link--active" : ""}`}
                  onClick={() => go("/dashboard")}
                >
                  <Dashboard size={16} />
                  <span>{t("nav.dashboard")}</span>
                </button>
                {isTeacherOrAdmin && (
                  <button
                    type="button"
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
                        return (
                          <button
                            key={c.id}
                            type="button"
                            className={`side-menu__classroom${isCurrent ? " side-menu__classroom--active" : ""}`}
                            onClick={() => go(`/classrooms/${c.id}`)}
                          >
                            <Icon size={16} />
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

        {/* ── Question Banks tab ── */}
        {activeTab === "banks" && banks.length > 0 && (
          <div className="side-menu__section">
            <div className="side-menu__section-header">
              <Book size={16} />
              <span>{t("nav.questionBanks")}</span>
            </div>
            <div className="side-menu__bank-list">
              {banks.map((b) => {
                const isCurrent = b.id === bankId;
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={`side-menu__bank${isCurrent ? " side-menu__bank--active" : ""}`}
                    onClick={() => go(`/question-banks/${b.id}`)}
                  >
                    <span className="side-menu__bank-name">{b.name}</span>
                    <span className="side-menu__bank-meta">
                      {b.category === "coding" ? "Coding" : "Exam"} · {b.questionCount}
                    </span>
                    {isCurrent && <Checkmark size={14} className="side-menu__bank-check" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Chat tab ── */}
        {activeTab === "chat" && (
          <div className="side-menu__chat-tab">
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
        )}
      </nav>
    </>
  );
};

export default SideMenu;
