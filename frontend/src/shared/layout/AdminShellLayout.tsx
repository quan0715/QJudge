import { useEffect, type ComponentType, type ReactNode } from "react";
import {
  Header,
  HeaderGlobalBar,
  SideNav,
  SideNavItems,
  SideNavLink,
} from "@carbon/react";
import { WorkspaceShell } from "@/features/chatbot/components/workspace/WorkspaceShell";
import styles from "./AdminShellLayout.module.scss";

export interface NavItem {
  id: string;
  icon: ComponentType<{ size?: number }>;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

export type SideNavMode =
  | { variant: "rail" }
  | { variant: "expanded"; width?: string };

export interface AdminShellLayoutProps {
  headerAriaLabel: string;
  headerLeft: ReactNode;
  headerActions: ReactNode;
  sideNavAriaLabel: string;
  sideNavMode: SideNavMode;
  navItems: NavItem[];
  children: ReactNode;
  headerZIndex?: number;
  className?: string;
  contentClassName?: string;
  /** Enable AI workspace split panel */
  enableAI?: boolean;
}

const AdminShellLayout = ({
  headerAriaLabel,
  headerLeft,
  headerActions,
  sideNavAriaLabel,
  sideNavMode,
  navItems,
  children,
  headerZIndex,
  className,
  contentClassName,
  enableAI = false,
}: AdminShellLayoutProps) => {
  const isRail = sideNavMode.variant === "rail";
  const sidenavWidth = isRail
    ? "3rem"
    : sideNavMode.width ?? "16rem";

  // Prevent document-level scrolling while this fixed-position shell is mounted.
  // Without this, Carbon Toggle's focus() call can scroll window (via scrollIntoView),
  // causing visual glitches in the clipped flex layout.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const cssVars = {
    "--admin-shell-sidenav-width": sidenavWidth,
    ...(headerZIndex != null && { "--admin-shell-header-z": String(headerZIndex) }),
  } as React.CSSProperties;

  return (
    <div
      className={`${styles.layout}${className ? ` ${className}` : ""}`}
      style={cssVars}
    >
      <Header aria-label={headerAriaLabel} className={styles.header}>
        {headerLeft}
        <HeaderGlobalBar>{headerActions}</HeaderGlobalBar>
      </Header>

      <SideNav
        aria-label={sideNavAriaLabel}
        {...(isRail ? { isRail: true } : { expanded: true })}
        className={`${styles.sidenav}${!isRail ? ` ${styles.sidenavExpanded}` : ""}`}
      >
        <SideNavItems>
          {navItems.map((item) => (
            <SideNavLink
              key={item.id}
              renderIcon={item.icon}
              isActive={item.isActive}
              onClick={item.onClick}
            >
              {item.label}
            </SideNavLink>
          ))}
        </SideNavItems>
      </SideNav>

      <main className={styles.content}>
        {enableAI ? (
          <WorkspaceShell omitAppSidebar>
            <div className={`${styles.contentViewport}${contentClassName ? ` ${contentClassName}` : ""}`}>
              {children}
            </div>
          </WorkspaceShell>
        ) : (
          <div className={`${styles.contentViewport}${contentClassName ? ` ${contentClassName}` : ""}`}>
            {children}
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminShellLayout;
