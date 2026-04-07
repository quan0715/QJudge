/**
 * ScheduleCard — Carbon-aligned compound component for schedule event cards.
 *
 * Visual: flat tile with 4px left accent border, 16px inline icon, clean type hierarchy.
 *
 * Usage:
 *   <ScheduleCard.Root onClick={...} accentColor="var(--cds-interactive)">
 *     <ScheduleCard.Header icon={<Calendar size={16} />} tag={<Tag ...>即將開始</Tag>}>
 *       期中考
 *     </ScheduleCard.Header>
 *     <ScheduleCard.Time start={startIso} end={endIso} />
 *     <ScheduleCard.Meta>prof.chen · 考試</ScheduleCard.Meta>
 *   </ScheduleCard.Root>
 */

import type { ReactNode, CSSProperties } from "react";
import { Time } from "@carbon/icons-react";
import { formatDateTime, DATE_FORMATS } from "@/i18n/dateUtils";
import styles from "./ScheduleCard.module.scss";

// ── Root ──────────────────────────────────────────────────────────────────────

interface RootProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  /** CSS colour value for left accent border */
  accentColor?: string;
  /** Dimmed visual for ended / archived items */
  muted?: boolean;
}

function Root({ children, onClick, className, style, accentColor, muted }: RootProps) {
  const cls = [styles.root, muted ? styles.rootMuted : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  const mergedStyle: CSSProperties = {
    ...style,
    ...(accentColor ? { borderLeftColor: accentColor } : {}),
  };

  if (onClick) {
    return (
      <button type="button" className={cls} style={mergedStyle} onClick={onClick}>
        {children}
      </button>
    );
  }

  return (
    <div className={cls} style={mergedStyle}>
      {children}
    </div>
  );
}

// ── Header (icon + title + optional tag) ──────────────────────────────────────

interface HeaderProps {
  children: ReactNode;
  icon?: ReactNode;
  tag?: ReactNode;
}

function Header({ children, icon, tag }: HeaderProps) {
  return (
    <div className={styles.header}>
      {icon && <span className={styles.headerIcon}>{icon}</span>}
      <span className={styles.title}>{children}</span>
      {tag && <span className={styles.headerTag}>{tag}</span>}
    </div>
  );
}

// ── Time ──────────────────────────────────────────────────────────────────────

interface TimeRangeProps {
  start?: string | null;
  end?: string | null;
}

function TimeRange({ start, end }: TimeRangeProps) {
  if (!start && !end) return null;
  const startStr = start ? formatDateTime(start, DATE_FORMATS.SHORT) : "—";
  const endStr   = end   ? formatDateTime(end,   DATE_FORMATS.SHORT) : "—";

  return (
    <p className={styles.time}>
      <Time size={12} className={styles.timeIcon} />
      {startStr}
      {end ? ` — ${endStr}` : null}
    </p>
  );
}

// ── Meta ──────────────────────────────────────────────────────────────────────

function Meta({ children }: { children: ReactNode }) {
  return <p className={styles.meta}>{children}</p>;
}

// ── Compound export ───────────────────────────────────────────────────────────

export const ScheduleCard = {
  Root,
  Header,
  Time: TimeRange,
  Meta,
};
