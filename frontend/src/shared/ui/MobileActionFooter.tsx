import { Children, type ReactNode } from "react";
import { ButtonSet } from "@carbon/react";
import styles from "./MobileActionFooter.module.scss";

interface MobileActionFooterProps {
  children: ReactNode;
}

/**
 * Sticky bottom footer for mobile viewports that hosts up to a few primary
 * actions (rendered flush via Carbon `ButtonSet`). Renders nothing on
 * desktop, and nothing on mobile when all children resolve to null/false.
 *
 * Visual style mirrors the attendance scan footer (`AttendanceShell`):
 * full-width buttons, no gap, 5–6rem tall.
 */
export function MobileActionFooter({ children }: MobileActionFooterProps) {
  const hasContent = Children.toArray(children).length > 0;
  if (!hasContent) return null;
  return (
    <>
      <div className={styles.spacer} aria-hidden="true" />
      <div className={styles.footer}>
        <ButtonSet>{children}</ButtonSet>
      </div>
    </>
  );
}
