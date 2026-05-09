import { Children, type ReactNode } from "react";
import { MobileButtonSet } from "./MobileButtonSet";
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
 * two-slot button set, no gap, 5–6rem tall. A single action occupies the
 * right slot and leaves the left slot empty.
 */
export function MobileActionFooter({ children }: MobileActionFooterProps) {
  const actionCount = Children.toArray(children).length;
  if (actionCount === 0) return null;
  return (
    <>
      <div className={styles.spacer} aria-hidden="true" />
      <div className={styles.footer}>
        <MobileButtonSet>{children}</MobileButtonSet>
      </div>
    </>
  );
}
