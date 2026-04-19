import { type ReactNode } from "react";
import styles from "./ClassroomAdminLayout.module.scss";

export type ClassroomAdminPanelId = "overview" | "announcements" | "contests" | "members" | "settings";

interface ClassroomAdminLayoutProps {
  children: ReactNode;
}

const ClassroomAdminLayout = ({ children }: ClassroomAdminLayoutProps) => (
  <div className={styles.shell}>
    <main className={styles.content}>{children}</main>
  </div>
);

export default ClassroomAdminLayout;
