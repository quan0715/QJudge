/**
 * ChatFab — Standalone floating action button that navigates to /chat.
 *
 * Can be placed anywhere (inside or outside MainLayout).
 * Only visible for teacher/admin roles.
 */
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import AiLaunch from "@carbon/icons-react/es/AiLaunch.js";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import styles from "./ChatFab.module.scss";

export function ChatFab() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "admin";
  if (!isTeacherOrAdmin) return null;

  return createPortal(
    <button
      className={styles.toggleButton}
      onClick={() => navigate("/chat")}
      aria-label="開啟 AI 助教"
    >
      <AiLaunch size={20} />
    </button>,
    document.body,
  );
}
