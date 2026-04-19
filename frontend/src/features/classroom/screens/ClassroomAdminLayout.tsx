import { type ReactNode } from "react";
import { IconButton } from "@carbon/react";
import { Settings } from "@carbon/icons-react";
import styles from "./ClassroomAdminLayout.module.scss";

export type ClassroomAdminPanelId = "overview" | "announcements" | "contests" | "members" | "settings";

interface ClassroomAdminLayoutProps {
  children: ReactNode;
  onOpenSettings?: () => void;
}

const ClassroomAdminLayout = ({ children, onOpenSettings }: ClassroomAdminLayoutProps) => (
  <div className={styles.shell}>
    {onOpenSettings && (
      <div className={styles.pageActions}>
        <IconButton kind="ghost" size="sm" label="教室設定" align="left" onClick={onOpenSettings}>
          <Settings size={16} />
        </IconButton>
      </div>
    )}
    <main className={styles.content}>{children}</main>
  </div>
);

export default ClassroomAdminLayout;
