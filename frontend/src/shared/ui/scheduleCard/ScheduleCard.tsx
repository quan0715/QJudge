/**
 * ScheduleCard — compound component for calendar event cards.
 *
 * Usage:
 *   <ScheduleCard.Root onClick={...}>
 *     <ScheduleCard.Badge icon={<Calendar />} color="blue" />
 *     <ScheduleCard.Content>
 *       <ScheduleCard.Title>期中考</ScheduleCard.Title>
 *       <ScheduleCard.Time start={startIso} end={endIso} />
 *       <ScheduleCard.Meta>teacher · 2026/04/07</ScheduleCard.Meta>
 *     </ScheduleCard.Content>
 *     <ScheduleCard.Aside>
 *       <Tag type="green">進行中</Tag>
 *     </ScheduleCard.Aside>
 *   </ScheduleCard.Root>
 */

import type { ReactNode, CSSProperties } from "react";
import { Time } from "@carbon/icons-react";
import { formatDateTime, DATE_FORMATS } from "@/i18n/dateUtils";
import styles from "./ScheduleCard.module.scss";

// ── Badge colour tokens ───────────────────────────────────────────────────────

export type ScheduleCardColor = "blue" | "green" | "gray" | "purple" | "orange";

const COLOR_CLASS: Record<ScheduleCardColor, string> = {
  blue:   styles.badgeBlue,
  green:  styles.badgeGreen,
  gray:   styles.badgeGray,
  purple: styles.badgePurple,
  orange: styles.badgeOrange,
};

// ── Root ──────────────────────────────────────────────────────────────────────

interface RootProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  /** Apply dimmed / ended appearance */
  muted?: boolean;
}

function Root({ children, onClick, className, style, muted }: RootProps) {
  const cls = [
    styles.root,
    muted ? styles.rootMuted : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (onClick) {
    return (
      <button type="button" className={cls} style={style} onClick={onClick}>
        {children}
      </button>
    );
  }

  return (
    <div className={cls} style={style}>
      {children}
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────

interface BadgeProps {
  icon: ReactNode;
  color: ScheduleCardColor;
}

function Badge({ icon, color }: BadgeProps) {
  return (
    <span className={`${styles.badge} ${COLOR_CLASS[color]}`} aria-hidden>
      {icon}
    </span>
  );
}

// ── Content ───────────────────────────────────────────────────────────────────

function Content({ children }: { children: ReactNode }) {
  return <div className={styles.content}>{children}</div>;
}

// ── Title ─────────────────────────────────────────────────────────────────────

function Title({ children }: { children: ReactNode }) {
  return <p className={styles.title}>{children}</p>;
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
      <Time size={12} className={styles.timeIcon} aria-hidden />
      {startStr}
      {end ? <> — {endStr}</> : null}
    </p>
  );
}

// ── Meta ──────────────────────────────────────────────────────────────────────

function Meta({ children }: { children: ReactNode }) {
  return <p className={styles.meta}>{children}</p>;
}

// ── Aside ─────────────────────────────────────────────────────────────────────

function Aside({ children }: { children: ReactNode }) {
  return <div className={styles.aside}>{children}</div>;
}

// ── Compound export ───────────────────────────────────────────────────────────

export const ScheduleCard = {
  Root,
  Badge,
  Content,
  Title,
  Time: TimeRange,
  Meta,
  Aside,
};
