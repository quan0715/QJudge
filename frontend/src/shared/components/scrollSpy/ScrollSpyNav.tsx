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
import styles from "./ScrollSpyNav.module.scss";

export type SectionValidationState = "valid" | "invalid" | "incomplete" | "none";

export interface NavSection extends ScrollSpySection {
  validationState?: SectionValidationState;
  errorCount?: number;
}

export interface ScrollSpyNavProps {
  sections: NavSection[];
  activeId: string;
  onSectionClick: (sectionId: string) => void;
  onPreviewClick?: () => void;
  className?: string;
}

const DEFAULT_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  "basic-info": Information,
  content: DocumentBlank,
  "test-cases": DataBase,
  "language-config": Code,
  "danger-zone": WarningAlt,
};

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
