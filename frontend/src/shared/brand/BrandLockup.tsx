import { useTheme } from "@/shared/ui/theme/ThemeContext";
import "./BrandLockup.scss";

interface BrandLockupProps {
  label?: string;
  size?: number;
  className?: string;
}

export const BrandLockup = ({
  label,
  size = 20,
  className = "",
}: BrandLockupProps) => {
  const { theme } = useTheme();
  const variant = theme === "g90" || theme === "g100" ? "dark" : "light";
  const classes = ["brand-lockup", className].filter(Boolean).join(" ");

  return (
    <span className={classes}>
      {label ? (
        <>
          <img src="/brand/qjudge-mark.svg" alt="" width={size} height={size} />
          <span className="brand-lockup__label">{label}</span>
        </>
      ) : (
        <img
          className="brand-lockup__wordmark"
          src={`/brand/qjudge-edu-logo-${variant}.svg`}
          alt="QJudge @Edu"
          height={size}
        />
      )}
    </span>
  );
};
