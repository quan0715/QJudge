/**
 * ScheduleCard — Carbon-aligned compound component for schedule event cards.
 *
 * Slots: Root → Header, Time, Description, Meta
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
  accentColor?: string;
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

const TIME_HM: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

interface TimeRangeProps {
  start?: string | null;
  end?: string | null;
  /** When true, always show time-only (HH:mm) regardless of date. Use inside calendar where date is already shown. */
  timeOnly?: boolean;
}

function TimeRange({ start, end, timeOnly }: TimeRangeProps) {
  if (!start && !end) return null;

  const fmt = (iso: string) =>
    timeOnly
      ? formatDateTime(iso, TIME_HM)
      : formatDateTime(iso, DATE_FORMATS.SHORT);

  const startStr = start ? fmt(start) : "—";
  const endStr   = end   ? fmt(end)   : "—";

  return (
    <p className={styles.time}>
      <Time size={12} className={styles.timeIcon} />
      {startStr}
      {end ? ` — ${endStr}` : null}
    </p>
  );
}

// ── Description (single-line truncated body text) ─────────────────────────────

function Description({ children }: { children: ReactNode }) {
  return <p className={styles.description}>{children}</p>;
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
  Description,
  Meta,
};
