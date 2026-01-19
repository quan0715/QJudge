import React from "react";
import { Tag } from "@carbon/react";
import "./TagStyle.scss";

export interface AcrBadgeProps {
  value?: number; // 0-100 or 0-1
  size?: "sm" | "md";
  className?: string;
  label?: string;
}

const formatRate = (value?: number) => {
  if (value === undefined || value === null) return 0;
  const rate = value > 1 ? value : value * 100;
  const rounded = Number.isFinite(rate) ? rate : 0;
  return Math.max(0, Math.min(rounded, 100));
};

const getRingColor = (rate: number) => {
  if (rate >= 60) return "var(--cds-support-success)";
  if (rate >= 40) return "var(--cds-support-warning)";
  return "var(--cds-support-error)";
};

export const AcrBadge: React.FC<AcrBadgeProps> = ({
  value,
  size = "md",
  className,
  label = "AC Rate",
}) => {
  const rate = formatRate(value);
  const display = `${label}: ${rate.toFixed(1).replace(/\.0$/, "")}%`;
  const tagClass = className
    ? `${className} tag-line acr-badge`
    : "tag-line acr-badge";
  const ringColor = getRingColor(rate);
  const ringStyle = {
    background: `conic-gradient(${ringColor} ${rate}%, var(--cds-border-strong) ${rate}% 100%)`,
  };

  return (
    <Tag type="cool-gray" size={size} className={tagClass} title={display}>
      <span className="acr-badge__ring" style={ringStyle}>
        <span className="acr-badge__ring-center" />
      </span>
      <span className="acr-badge__text">{display}</span>
    </Tag>
  );
};

export default AcrBadge;
