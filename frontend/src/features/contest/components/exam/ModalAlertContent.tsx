import type { ReactNode } from "react";
import styles from "./ModalAlertContent.module.scss";

type Variant = "warning" | "error" | "success" | "neutral";

const variantClass: Record<Variant, string> = {
  warning: styles.iconCircleWarning,
  error: styles.iconCircleError,
  success: styles.iconCircleSuccess,
  neutral: styles.iconCircleNeutral,
};

interface ModalAlertContentProps {
  icon: ReactNode;
  variant: Variant;
  title: string;
  description?: ReactNode;
  /** Use primary text color for description instead of secondary */
  descriptionPrimary?: boolean;
  children?: ReactNode;
}

export const ModalAlertContent = ({
  icon,
  variant,
  title,
  description,
  descriptionPrimary = false,
  children,
}: ModalAlertContentProps) => (
  <div className={styles.wrapper}>
    <div className={`${styles.iconCircle} ${variantClass[variant]}`}>
      {icon}
    </div>
    <p className={styles.title}>{title}</p>
    {description && (
      <p className={descriptionPrimary ? styles.descriptionPrimary : styles.description}>
        {description}
      </p>
    )}
    {children}
  </div>
);
