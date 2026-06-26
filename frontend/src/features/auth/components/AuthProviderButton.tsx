import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

interface AuthProviderButtonProps {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  trailingIcon?: ReactNode;
  variant?: "default" | "sso";
}

export const AuthProviderButton = ({
  label,
  icon,
  onClick,
  disabled = false,
  loading = false,
  trailingIcon,
  variant = "default",
}: AuthProviderButtonProps) => {
  const shouldReduceMotion = useReducedMotion();
  const className =
    [
      "auth-oauth-btn",
      variant === "sso" ? "auth-oauth-btn--sso" : null,
      trailingIcon ? "auth-oauth-btn--has-trailing" : null,
    ]
      .filter(Boolean)
      .join(" ");
  const isAnimating = loading && !shouldReduceMotion;

  return (
    <motion.button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={label}
      aria-busy={loading || undefined}
      data-loading={loading ? "true" : undefined}
      whileTap={disabled || loading ? undefined : { scale: 0.99 }}
      animate={isAnimating ? { opacity: [1, 0.82, 1] } : { opacity: 1 }}
      transition={
        isAnimating
          ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" }
          : { duration: 0.15 }
      }
    >
      {loading ? (
        <span className="auth-oauth-btn__icon" aria-hidden="true">
          <span className="auth-oauth-btn__spinner" />
        </span>
      ) : (
        icon
      )}
      <span className="auth-oauth-btn__label">{label}</span>
      {trailingIcon}
    </motion.button>
  );
};
