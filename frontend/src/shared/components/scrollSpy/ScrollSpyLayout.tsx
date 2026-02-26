import React, { useRef } from "react";
import { useScrollSpy } from "@/shared/hooks/useScrollSpy";
import { ScrollSpyNav, type NavSection } from "./ScrollSpyNav";
import styles from "./ScrollSpyLayout.module.scss";

export interface ScrollSpyLayoutProps {
  sections: NavSection[];
  onPreviewClick?: () => void;
  children: (props: {
    registerSection: (id: string) => (el: HTMLElement | null) => void;
  }) => React.ReactNode;
  headerContent?: React.ReactNode;
  footerContent?: React.ReactNode;
  className?: string;
}

export const ScrollSpyLayout: React.FC<ScrollSpyLayoutProps> = ({
  sections,
  onPreviewClick,
  children,
  headerContent,
  footerContent,
  className,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);

  const { activeId, scrollToSection, registerSection } = useScrollSpy({
    sections,
    containerRef: contentRef,
    rootMargin: "-10% 0px -70% 0px",
  });

  return (
    <div className={`${styles.layout} ${className || ""}`}>
      <aside className={styles.sidebar}>
        {headerContent && (
          <div className={styles.sidebarHeader}>{headerContent}</div>
        )}

        <ScrollSpyNav
          sections={sections}
          activeId={activeId}
          onSectionClick={scrollToSection}
          onPreviewClick={onPreviewClick}
          className={styles.nav}
        />

        {footerContent && (
          <div className={styles.sidebarFooter}>{footerContent}</div>
        )}
      </aside>

      <main className={styles.content} ref={contentRef}>
        {children({ registerSection })}
      </main>
    </div>
  );
};

export default ScrollSpyLayout;
