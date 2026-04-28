import { type ReactNode, type CSSProperties, forwardRef } from "react";
import styles from "./AdminSplitLayout.module.scss";

type AdminSplitLayoutMobileMode = "drawers" | "stacked" | "contentOnly";

interface AdminSplitLayoutProps {
  toolbar?: ReactNode;
  sidebar: ReactNode;
  sidebarHidden?: boolean;
  sidebarClassName?: string;
  sidebarWidth?: number;
  middlePane?: ReactNode;
  middlePaneWidth?: number;
  rightPane?: ReactNode;
  rightPaneWidth?: number;
  children: ReactNode;
  contentMaxWidth?: number;
  contentClassName?: string;
  className?: string;
  mobileMode?: AdminSplitLayoutMobileMode;
  mobileSidebarOpen?: boolean;
  mobileDetailOpen?: boolean;
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
      sidebarHidden = false,
      sidebarClassName,
      sidebarWidth = 260,
      middlePane,
      middlePaneWidth = 220,
      rightPane,
      rightPaneWidth = 320,
      children,
      contentMaxWidth = 740,
      contentClassName,
      className,
      mobileMode = "drawers",
      mobileSidebarOpen = false,
      mobileDetailOpen,
    },
    ref,
  ) => {
    const detailOpen = mobileDetailOpen ?? Boolean(rightPane);
    const cssVars = {
      "--sidebar-width": `${sidebarWidth}px`,
      "--content-max-width": `${contentMaxWidth}px`,
      ...(middlePane ? { "--middle-width": `${middlePaneWidth}px` } : {}),
      ...(rightPane ? { "--right-width": `${rightPaneWidth}px` } : {}),
    } as CSSProperties;

    const rootClasses = [
      styles.root,
      toolbar && styles.hasToolbar,
      !sidebarHidden && !middlePane && !rightPane && styles.noMiddle,
      !sidebarHidden && rightPane && !middlePane && styles.withRightOnly,
      !sidebarHidden && rightPane && middlePane && styles.withMiddleAndRight,
      sidebarHidden && !middlePane && !rightPane && styles.noSidebarNoMiddle,
      sidebarHidden && !middlePane && !!rightPane && styles.noSidebarWithRight,
      sidebarHidden && !!middlePane && !rightPane && styles.noSidebarWithMiddle,
      sidebarHidden && !!middlePane && !!rightPane && styles.noSidebarWithMiddleAndRight,
      mobileMode === "drawers" && styles.mobileDrawerLayout,
      mobileMode === "contentOnly" && styles.mobileContentOnly,
      mobileSidebarOpen && styles.mobileSidebarOpen,
      mobileMode === "drawers" && !mobileSidebarOpen && styles.sidebarClosed,
      detailOpen && styles.mobileDetailOpen,
      mobileMode === "drawers" && !detailOpen && styles.detailClosed,
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
        {!sidebarHidden ? (
          <div
            className={[styles.sidebar, sidebarClassName].filter(Boolean).join(" ")}
          >
            {sidebar}
          </div>
        ) : null}
        {middlePane && <div className={styles.middle}>{middlePane}</div>}
        <div className={contentClasses} ref={ref}>
          {children}
        </div>
        {rightPane && <div className={styles.right}>{rightPane}</div>}
      </div>
    );
  },
);

AdminSplitLayout.displayName = "AdminSplitLayout";
export default AdminSplitLayout;
