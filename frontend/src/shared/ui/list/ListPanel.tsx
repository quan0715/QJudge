import type { ReactNode } from "react";
import styles from "./ListPanel.module.scss";

// ─── Helpers ────────────────────────────────────────────────
const cx = (...classes: (string | false | undefined | null)[]) =>
  classes.filter(Boolean).join(" ");

// ─── ListPanel ──────────────────────────────────────────────
export const ListPanel = ({
  children,
  header,
  footer,
  className,
}: {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) => (
  <div className={cx(styles.panel, className)}>
    {header}
    <div className={styles.scrollArea}>{children}</div>
    {footer}
  </div>
);

// ─── ListHeader ─────────────────────────────────────────────
export const ListHeader = ({
  title,
  action,
  className,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
}) => (
  <div className={cx(styles.header, className)}>
    <span className={styles.headerTitle}>{title}</span>
    {action}
  </div>
);

// ─── ListFooter ─────────────────────────────────────────────
export const ListFooter = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cx(styles.footer, className)}>{children}</div>
);

// ─── ListItem ───────────────────────────────────────────────
interface ListItemProps {
  children: ReactNode;
  active?: boolean;
  danger?: boolean;
  size?: "default" | "compact";
  asButton?: boolean;
  onClick?: () => void;
  className?: string;
}

export const ListItem = ({
  children,
  active = false,
  danger = false,
  size = "default",
  asButton = false,
  onClick,
  className,
}: ListItemProps) => {
  const cls = cx(
    styles.item,
    active && styles.itemActive,
    danger && styles.itemDanger,
    size === "compact" && styles.itemCompact,
    className,
  );

  if (asButton || onClick) {
    return (
      <button type="button" className={cls} onClick={onClick}>
        {children}
      </button>
    );
  }

  return <div className={cls}>{children}</div>;
};

// ─── Slot Primitives ────────────────────────────────────────
interface SlotProps {
  children: ReactNode;
  className?: string;
}

export const ListItemLeading = ({ children, className }: SlotProps) => (
  <div className={cx(styles.leading, className)}>{children}</div>
);

export const ListItemContent = ({ children, className }: SlotProps) => (
  <div className={cx(styles.content, className)}>{children}</div>
);

export const ListItemTitle = ({ children, className }: SlotProps) => (
  <div className={cx(styles.title, className)}>{children}</div>
);

export const ListItemMeta = ({ children, className }: SlotProps) => (
  <div className={cx(styles.meta, className)}>{children}</div>
);

export const ListItemTrailing = ({ children, className }: SlotProps) => (
  <div className={cx(styles.trailing, className)}>{children}</div>
);
