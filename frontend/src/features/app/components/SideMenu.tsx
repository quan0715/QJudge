import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Dashboard,
  Education,
  Book,
  Checkmark,
  Globe,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { getClassrooms } from "@/infrastructure/api/repositories/classroom.repository";
import { getQuestionBanks as listMyBanks } from "@/infrastructure/api/repositories/questionBank.repository";
import { getClassroomIcon } from "@/features/classroom/constants/classroomIcons";
import type { Classroom } from "@/core/entities/classroom.entity";
import type { QuestionBank } from "@/core/entities/question-bank.entity";
import { useChatSessionContext } from "@/features/chatbot/contexts/ChatSessionContext";
import { chatbotRepository } from "@/infrastructure/api/repositories";
import { ChatHistoryPanel } from "@/features/chatbot/components/chat-ui/ChatHistoryPanel";
import "./SideMenu.scss";

type TabKey = "classrooms" | "banks" | "chat";

function getDefaultTab(pathname: string): TabKey {
  if (pathname.startsWith("/classrooms")) return "classrooms";
  if (pathname.startsWith("/question-banks")) return "banks";
  if (pathname.startsWith("/chat")) return "chat";
  return "classrooms";
}

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SideMenu: React.FC<SideMenuProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation("common");
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

  const { sessions, refreshSessions } = useChatSessionContext();

  const currentSessionId = useMemo(() => {
    const match = location.pathname.match(/^\/chat\/([^/]+)/);
    return match?.[1] ?? null;
  }, [location.pathname]);

  useEffect(() => {
    setActiveTab(getDefaultTab(location.pathname));
  }, [location.pathname]);

  useEffect(() => {
    if (isOpen && activeTab === "chat" && isTeacherOrAdmin) {
      void refreshSessions();
    }
  }, [isOpen, activeTab, isTeacherOrAdmin, refreshSessions]);

  const classroomId = useMemo(() => {
    const match = location.pathname.match(/^\/classrooms\/([^/]+)/);
    return match?.[1];
  }, [location.pathname]);

  const bankId = useMemo(() => {
    const match = location.pathname.match(/^\/question-banks\/([^/]+)/);
    return match?.[1];
  }, [location.pathname]);

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
    if (isOpen && !fetched) void fetchData();
  }, [isOpen, fetched, fetchData]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (drawerRef.current?.contains(target)) return;
      const toggle = document.querySelector(`[data-side-menu-toggle]`);
      if (toggle?.contains(target)) return;
      onClose();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  const go = useCallback((path: string) => { onClose(); navigate(path); }, [onClose, navigate]);

  const isActive = (prefix: string) => location.pathname.startsWith(prefix);

  const handleNewChat = useCallback(async () => {
    try {
      const newSession = await chatbotRepository.createSession();
      void refreshSessions();
      onClose();
      navigate(`/chat/${newSession.id}`);
    } catch {
      onClose();
      navigate("/chat");
    }
  }, [refreshSessions, onClose, navigate]);

  const handleSelectSession = useCallback((id: string) => {
    onClose();
    navigate(`/chat/${id}`);
  }, [onClose, navigate]);

  const handleDeleteSession = useCallback(async (id: string) => {
    try {
      await chatbotRepository.deleteSession(id);
      void refreshSessions();
      if (id === currentSessionId) {
        const remaining = sessions.filter((s) => s.id !== id);
        if (remaining.length > 0) {
          navigate(`/chat/${remaining[0].id}`, { replace: true });
        } else {
          navigate("/chat", { replace: true });
        }
      }
    } catch {
      // silently ignore
    }
  }, [currentSessionId, sessions, refreshSessions, navigate]);

  const handleRenameSession = useCallback(async (id: string, title: string) => {
    try {
      await chatbotRepository.renameSession(id, title);
      void refreshSessions();
    } catch {
      // silently ignore
    }
  }, [refreshSessions]);

  const tabs: { key: TabKey; label: string; show: boolean }[] = [
    { key: "classrooms", label: t("nav.classrooms"), show: true },
    { key: "banks", label: t("nav.questionBanks"), show: isTeacherOrAdmin },
    { key: "chat", label: t("nav.chat", "Chat"), show: isTeacherOrAdmin },
  ].filter((tab) => tab.show);

  return (
    <>
      <div
        className={`side-menu-backdrop${isOpen ? " side-menu-backdrop--visible" : ""}`}
        aria-hidden="true"
      />
      <nav
        ref={drawerRef}
        className={`side-menu${isOpen ? " side-menu--open" : ""}`}
        aria-label={t("header.sideNav", "Side navigation")}
      >
        {/* Tab bar */}
        <div className="side-menu__tabs" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`side-menu__tab${activeTab === tab.key ? " side-menu__tab--active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Classrooms tab */}
        {activeTab === "classrooms" && (
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
                    <Education size={16} />
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
        )}

        {/* Question banks tab */}
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

        {/* Chat tab */}
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
