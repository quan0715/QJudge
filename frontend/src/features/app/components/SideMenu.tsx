import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { listMine as listMyBanks } from "@/infrastructure/api/repositories/questionBank.repository";
import { getClassroomIcon } from "@/features/classroom/constants/classroomIcons";
import type { Classroom } from "@/core/entities/classroom.entity";
import type { QuestionBank } from "@/core/entities/question-bank.entity";
import "./SideMenu.scss";

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

  // Extract IDs from URL since this component lives outside route context
  const classroomId = useMemo(() => {
    const match = location.pathname.match(/^\/classrooms\/([^/]+)/);
    return match?.[1];
  }, [location.pathname]);

  const bankId = useMemo(() => {
    const match = location.pathname.match(/^\/question-banks\/([^/]+)/);
    return match?.[1];
  }, [location.pathname]);

  const isTeacherOrAdmin =
    user?.role === "teacher" || user?.role === "admin";

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [fetched, setFetched] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const promises: Promise<void>[] = [
      getClassrooms()
        .then((rows) => setClassrooms(rows))
        .catch(() => {}),
    ];
    if (isTeacherOrAdmin) {
      promises.push(
        listMyBanks()
          .then((rows) => setBanks(rows))
          .catch(() => {}),
      );
    }
    await Promise.all(promises);
    setFetched(true);
  }, [user, isTeacherOrAdmin]);

  useEffect(() => {
    if (isOpen && !fetched) {
      void fetchData();
    }
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

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  const isActive = (prefix: string) => location.pathname.startsWith(prefix);

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
        {/* Quick Links */}
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
            <>
              <button
                type="button"
                className={`side-menu__link${isActive("/question-banks") ? " side-menu__link--active" : ""}`}
                onClick={() => go("/question-banks")}
              >
                <Book size={16} />
                <span>{t("nav.questionBanks")}</span>
              </button>
              <button
                type="button"
                className={`side-menu__link${isActive("/marketplace") ? " side-menu__link--active" : ""}`}
                onClick={() => go("/marketplace")}
              >
                <Globe size={16} />
                <span>{t("nav.marketplace", "Marketplace")}</span>
              </button>
            </>
          )}
        </div>

        {/* Classroom List */}
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
                      {isCurrent && (
                        <Checkmark size={16} className="side-menu__classroom-check" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Question Bank List */}
        {banks.length > 0 && (
          <>
            <div className="side-menu__divider" />
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
                      {isCurrent && (
                        <Checkmark size={14} className="side-menu__bank-check" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </nav>
    </>
  );
};

export default SideMenu;
