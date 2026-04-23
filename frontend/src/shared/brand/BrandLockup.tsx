import "./BrandLockup.scss";

interface BrandLockupProps {
  label?: string;
  showLabel?: boolean;
  size?: number;
  className?: string;
}

export const BrandLockup = ({
  label = "QJudge",
  showLabel = true,
  size = 20,
  className = "",
}: BrandLockupProps) => {
  const classes = ["brand-lockup", className].filter(Boolean).join(" ");

  return (
    <span className={classes}>
      <img
        className="brand-lockup__mark"
        src="/brand/qjudge-logo-square.png"
        alt="QJudge logo"
        width={size}
        height={size}
      />
      {showLabel ? <span className="brand-lockup__label">{label}</span> : null}
    </span>
  );
};
