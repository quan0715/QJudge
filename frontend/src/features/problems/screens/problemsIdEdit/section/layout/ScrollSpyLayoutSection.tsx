import React, { useRef } from "react";
import { useScrollSpy } from "@/shared/hooks/useScrollSpy";
import { ScrollSpyNav, type NavSection } from "./ScrollSpyNavSection";
import styles from "./ScrollSpyLayoutSection.module.scss";

export interface ScrollSpyLayoutProps {
  /** Section configurations */
  sections: NavSection[];
  /** Callback when preview button is clicked */
  onPreviewClick?: () => void;
  /** Children render function that receives section registration */
  children: (props: {
    registerSection: (id: string) => (el: HTMLElement | null) => void;
  }) => React.ReactNode;
  /** Additional header content (e.g., problem switcher) */
  headerContent?: React.ReactNode;
  /** Additional class name */
  className?: string;
}

/**
 * ScrollSpyLayout - Main layout with scroll-spy navigation
 *
 * Layout structure:
 * ```
 * +------------------+----------------------------------------+
 * |   Left Sidebar   |         Content Area                   |
 * |                  |         (Scrollable)                   |
 * |   [Header]       |                                        |
 * |   [Problem List] |   Section 1                            |
 * |   ─────────────  |   Section 2                            |
 * |   [Scroll-spy]   |   Section 3                            |
 * |   - Section 1    |   ...                                  |
 * |   - Section 2    |                                        |
 * |   - Section 3    |                                        |
 * |   ─────────────  |                                        |
 * |   [Preview Btn]  |                                        |
 * +------------------+----------------------------------------+
 * ```
 */
export const ScrollSpyLayout: React.FC<ScrollSpyLayoutProps> = ({
  sections,
  onPreviewClick,
  children,
  headerContent,
  className,
}) => {
  // Content container ref for scroll spy
  const contentRef = useRef<HTMLDivElement>(null);

  // Scroll spy hook
  const { activeId, scrollToSection, registerSection } = useScrollSpy({
    sections,
    containerRef: contentRef,
    rootMargin: "-10% 0px -70% 0px",
  });

  return (
    <div className={`${styles.layout} ${className || ""}`}>
      {/* Left Sidebar */}
      <aside className={styles.sidebar}>
        {/* Optional header content (e.g., problem switcher) */}
        {headerContent && (
          <div className={styles.sidebarHeader}>{headerContent}</div>
        )}

        {/* Scroll-spy Navigation */}
        <ScrollSpyNav
          sections={sections}
          activeId={activeId}
          onSectionClick={scrollToSection}
          onPreviewClick={onPreviewClick}
          className={styles.nav}
        />
      </aside>

      {/* Main Content Area */}
      <main className={styles.content} ref={contentRef}>
        {children({ registerSection })}
      </main>
    </div>
  );
};

export default ScrollSpyLayout;
