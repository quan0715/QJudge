import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Section configuration for scroll spy
 */
export interface ScrollSpySection {
  /** Unique section ID (used as element id) */
  id: string;
  /** Display label for the section */
  label: string;
  /** Optional icon component */
  icon?: React.ComponentType<{ size?: number }>;
}

/**
 * Options for useScrollSpy hook
 */
export interface UseScrollSpyOptions {
  /** Array of section configurations */
  sections: ScrollSpySection[];
  /** Root margin for intersection observer (default: "-20% 0px -60% 0px") */
  rootMargin?: string;
  /** Threshold for intersection observer (default: 0) */
  threshold?: number | number[];
  /** Scroll container ref (default: document) */
  containerRef?: React.RefObject<HTMLElement | null>;
}

/**
 * Return type for useScrollSpy hook
 */
export interface UseScrollSpyReturn {
  /** Currently active section ID */
  activeId: string;
  /** Scroll to a specific section by ID */
  scrollToSection: (sectionId: string) => void;
  /** Register a section element ref */
  registerSection: (id: string) => (el: HTMLElement | null) => void;
}

/**
 * useScrollSpy - Hook for tracking visible sections during scroll
 *
 * Uses Intersection Observer API to detect which section is currently
 * in the viewport and updates the active section accordingly.
 *
 * Usage:
 * ```tsx
 * const sections = [
 *   { id: "basic-info", label: "基本資訊" },
 *   { id: "content", label: "題目內容" },
 * ];
 *
 * const { activeId, scrollToSection, registerSection } = useScrollSpy({ sections });
 *
 * // Register sections
 * <section ref={registerSection("basic-info")} id="basic-info">...</section>
 *
 * // Render nav
 * sections.map(s => (
 *   <NavItem
 *     active={s.id === activeId}
 *     onClick={() => scrollToSection(s.id)}
 *   />
 * ));
 * ```
 */
export function useScrollSpy({
  sections,
  rootMargin = "-20% 0px -60% 0px",
  threshold = 0,
  containerRef,
}: UseScrollSpyOptions): UseScrollSpyReturn {
  // Active section ID
  const [activeId, setActiveId] = useState<string>(sections[0]?.id || "");

  // Store section element refs
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Track visibility ratios for each section
  const visibilityRatios = useRef<Map<string, number>>(new Map());

  /**
   * Update active section based on visibility ratios
   */
  const updateActiveSection = useCallback(() => {
    let maxRatio = 0;
    let mostVisibleId = sections[0]?.id || "";

    visibilityRatios.current.forEach((ratio, id) => {
      if (ratio > maxRatio) {
        maxRatio = ratio;
        mostVisibleId = id;
      }
    });

    // Only update if there's a visible section
    if (maxRatio > 0) {
      setActiveId(mostVisibleId);
    }
  }, [sections]);

  /**
   * Intersection Observer callback
   */
  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        const id = entry.target.id;
        if (id) {
          if (entry.isIntersecting) {
            visibilityRatios.current.set(id, entry.intersectionRatio);
          } else {
            visibilityRatios.current.set(id, 0);
          }
        }
      });

      updateActiveSection();
    },
    [updateActiveSection]
  );

  /**
   * Set up Intersection Observer
   */
  useEffect(() => {
    const root = containerRef?.current || null;

    const observer = new IntersectionObserver(handleIntersection, {
      root,
      rootMargin,
      threshold,
    });

    // Observe all registered sections
    sectionRefs.current.forEach((el) => {
      if (el) {
        observer.observe(el);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [handleIntersection, rootMargin, threshold, containerRef]);

  /**
   * Register a section element
   */
  const registerSection = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) {
        sectionRefs.current.set(id, el);
      } else {
        sectionRefs.current.delete(id);
      }
    },
    []
  );

  /**
   * Scroll to a specific section
   */
  const scrollToSection = useCallback((sectionId: string) => {
    const el = sectionRefs.current.get(sectionId);
    if (el) {
      el.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    } else {
      // Fallback: try to find by ID in document
      const fallbackEl = document.getElementById(sectionId);
      if (fallbackEl) {
        fallbackEl.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }
  }, []);

  return {
    activeId,
    scrollToSection,
    registerSection,
  };
}

export default useScrollSpy;
