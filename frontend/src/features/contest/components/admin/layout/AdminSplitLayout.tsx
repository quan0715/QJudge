import { type ReactNode, type CSSProperties, forwardRef } from "react";
import styles from "./AdminSplitLayout.module.scss";

interface AdminSplitLayoutProps {
  toolbar?: ReactNode;
  sidebar: ReactNode;
  sidebarWidth?: number;
  middlePane?: ReactNode;
  middlePaneWidth?: number;
  children: ReactNode;
  contentMaxWidth?: number;
  contentClassName?: string;
  className?: string;
}

/**
 * Shared two/three-column admin panel layout.
 * `ref` is forwarded to the scrollable content area (used by ExamEditor scroll sync).
 */
const AdminSplitLayout = forwardRef<HTMLDivElement, AdminSplitLayoutProps>(
  (
    {
      toolbar,
      sidebar,
      sidebarWidth = 260,
      middlePane,
      middlePaneWidth = 220,
      children,
      contentMaxWidth = 740,
      contentClassName,
      className,
    },
    ref,
  ) => {
    const cssVars = {
      "--sidebar-width": `${sidebarWidth}px`,
      "--content-max-width": `${contentMaxWidth}px`,
      ...(middlePane ? { "--middle-width": `${middlePaneWidth}px` } : {}),
    } as CSSProperties;

    const rootClasses = [
      styles.root,
      !middlePane && styles.noMiddle,
      className,
    ]
      .filter(Boolean)
      .join(" ");

    const contentClasses = [styles.content, contentClassName]
      .filter(Boolean)
      .join(" ");

    return (
      <div className={rootClasses} style={cssVars}>
        {toolbar && <div className={styles.toolbar}>{toolbar}</div>}
        <div className={styles.sidebar}>{sidebar}</div>
        {middlePane && <div className={styles.middle}>{middlePane}</div>}
        <div className={contentClasses} ref={ref}>
          {children}
        </div>
      </div>
    );
  },
);

AdminSplitLayout.displayName = "AdminSplitLayout";
export default AdminSplitLayout;
