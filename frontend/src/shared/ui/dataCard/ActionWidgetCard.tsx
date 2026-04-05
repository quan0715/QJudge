import type { ComponentType, ReactNode } from "react";
import { ProgressBar, Tile } from "@carbon/react";
import { Edit } from "@carbon/icons-react";
import styles from "./ActionWidgetCard.module.scss";

export type ActionIntent = "navigate" | "toggle" | "danger";

export interface ActionWidgetCardProps {
  title: string;
  icon: ComponentType<{ size: number; className?: string }>;
  actionIcon?: ComponentType<{ size: number }>;
  actionIntent?: ActionIntent;
  /** Persistent active state — shows a subtle tint on the action button even without hover. */
  active?: boolean;
  value: ReactNode;
  /** Override color for the value text (e.g. red for alert numbers). */
  valueColor?: string;
  unit?: string;
  /** Optional progress bar (0–100). Renders a thin bar between value and footer. */
  progress?: number;
  cta: string;
  /** Show a notification dot on the action button (e.g. for unread alerts). */
  notificationDot?: boolean;
  /** Draw semantic red border (e.g. disabled/off states). */
  dangerBorder?: boolean;
  onClick: () => void;
}

const INTENT_CLASS: Record<ActionIntent, string> = {
  navigate: styles.intentNavigate,
  toggle: styles.intentToggle,
  danger: styles.intentDanger,
};

const ACTIVE_CLASS: Record<ActionIntent, string> = {
  navigate: styles.activeNavigate,
  toggle: styles.activeToggle,
  danger: styles.activeDanger,
};

export const ActionWidgetCard = ({
  title,
  icon: Icon,
  actionIcon: ActionIcon,
  actionIntent = "navigate",
  active = false,
  value,
  valueColor,
  unit,
  progress,
  cta,
  notificationDot = false,
  dangerBorder = false,
  onClick,
}: ActionWidgetCardProps) => (
  <button
    type="button"
    className={`${styles.button} ${styles[`intent_${actionIntent}`] ?? ""}`}
    onClick={onClick}
    aria-label={`${title} ${cta}`}
  >
    <Tile className={`${styles.card} ${dangerBorder ? styles.dangerBorder : ""}`}>
      <div className={styles.header}>
        <Icon size={16} className={styles.icon} />
        <h3 className={styles.title}>{title}</h3>
      </div>
      <div className={styles.value} style={valueColor ? { color: valueColor } : undefined}>
        <span>{value}</span>
        {unit && <span className={styles.unit}>{unit}</span>}
      </div>
      {progress != null && (
        <ProgressBar
          className={styles.progressBar}
          hideLabel
          label={title}
          size="small"
          value={progress}
        />
      )}
      <div className={styles.footer}>
        <span>{cta}</span>
        <span
          className={[
            styles.actionBtn,
            INTENT_CLASS[actionIntent],
            active ? ACTIVE_CLASS[actionIntent] : "",
          ].join(" ")}
        >
          {ActionIcon ? <ActionIcon size={16} /> : <Edit size={16} />}
          {notificationDot && <span className={styles.notificationDot} />}
        </span>
      </div>
    </Tile>
  </button>
);

export default ActionWidgetCard;
