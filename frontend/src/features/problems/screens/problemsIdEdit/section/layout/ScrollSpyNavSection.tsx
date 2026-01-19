import React from "react";
import { Button } from "@carbon/react";
import {
  Information,
  DocumentBlank,
  DataBase,
  Code,
  WarningAlt,
  View,
  Checkmark,
  ErrorFilled,
} from "@carbon/icons-react";
import type { ScrollSpySection } from "@/shared/hooks/useScrollSpy";
import styles from "./ScrollSpyNavSection.module.scss";

/**
 * Validation state for a section
 */
export type SectionValidationState = "valid" | "invalid" | "incomplete" | "none";

/**
 * Section with validation state
 */
export interface NavSection extends ScrollSpySection {
  /** Validation state */
  validationState?: SectionValidationState;
  /** Error count (for invalid state) */
  errorCount?: number;
}

export interface ScrollSpyNavProps {
  /** Array of sections to display */
  sections: NavSection[];
  /** Currently active section ID */
  activeId: string;
  /** Callback when a section is clicked */
  onSectionClick: (sectionId: string) => void;
  /** Callback when preview button is clicked */
  onPreviewClick?: () => void;
  /** Additional class name */
  className?: string;
}

/**
 * Default icons for sections
 */
const DEFAULT_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  "basic-info": Information,
  content: DocumentBlank,
  "test-cases": DataBase,
  "language-config": Code,
  "danger-zone": WarningAlt,
};

/**
 * Get validation indicator based on state
 */
const getValidationIndicator = (state?: SectionValidationState, errorCount?: number) => {
  switch (state) {
    case "valid":
      return (
        <span className={styles.validIndicator}>
          <Checkmark size={12} />
        </span>
      );
    case "invalid":
      return (
        <span className={styles.invalidIndicator}>
          <ErrorFilled size={12} />
          {errorCount && errorCount > 1 && (
            <span className={styles.errorCount}>{errorCount}</span>
          )}
        </span>
      );
    case "incomplete":
      return <span className={styles.incompleteIndicator} />;
    default:
      return null;
  }
};

/**
 * ScrollSpyNav - Left navigation for scroll-spy sections
 *
 * Features:
 * - Shows section labels with icons
 * - Highlights active section
 * - Shows validation state indicators
 * - Preview button at the bottom
 */
export const ScrollSpyNav: React.FC<ScrollSpyNavProps> = ({
  sections,
  activeId,
  onSectionClick,
  onPreviewClick,
  className,
}) => {
  return (
    <nav className={`${styles.nav} ${className || ""}`}>
      <ul className={styles.list}>
        {sections.map((section) => {
          const Icon = section.icon || DEFAULT_ICONS[section.id] || Information;
          const isActive = section.id === activeId;
          const isDanger = section.id === "danger-zone";

          return (
            <li key={section.id}>
              <button
                type="button"
                className={`${styles.item} ${isActive ? styles.active : ""} ${
                  isDanger ? styles.danger : ""
                }`}
                onClick={() => onSectionClick(section.id)}
                aria-current={isActive ? "true" : undefined}
              >
                <span className={styles.icon}>
                  <Icon size={16} />
                </span>
                <span className={styles.label}>{section.label}</span>
                {getValidationIndicator(section.validationState, section.errorCount)}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Preview Button */}
      {onPreviewClick && (
        <div className={styles.previewButton}>
          <Button
            kind="ghost"
            size="sm"
            renderIcon={View}
            onClick={onPreviewClick}
          >
            預覽題目
          </Button>
        </div>
      )}
    </nav>
  );
};

export default ScrollSpyNav;
