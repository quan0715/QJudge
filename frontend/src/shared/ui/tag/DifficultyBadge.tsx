import React from "react";
import { Tag } from "@carbon/react";
import { getDifficultyConfig } from "@/core/config/difficulty.config";
import type { Difficulty } from "@/core/entities/problem.entity";
import "./TagStyle.scss";

interface Props {
  difficulty: Difficulty | string;
  size?: "sm" | "md";
  className?: string;
  variant?: "tag" | "text";
}

const textColorMap: Record<string, string> = {
  green: "var(--problem-difficulty-easy)",
  cyan: "var(--problem-difficulty-medium)",
  red: "var(--problem-difficulty-hard)",
};

export const DifficultyBadge: React.FC<Props> = ({
  difficulty,
  size = "md",
  className,
  variant = "tag",
}) => {
  const config = getDifficultyConfig(difficulty as Difficulty);
  const color = textColorMap[config.type] || "var(--cds-text-secondary)";
  // Stronger contrast: increase color ratio for mix
  const background = `color-mix(in srgb, ${color} 26%, var(--cds-layer) 74%)`;

  if (variant === "text") {
    return (
      <span className={className} style={{ color, fontWeight: 500 }}>
        {config.label}
      </span>
    );
  }

  return (
    <Tag
      type={config.type}
      size={size}
      className={className}
      style={{
        backgroundColor: background,
        borderColor: color,
        color,
        fontWeight: 600,
      }}
      title={config.label}
    >
      {config.label}
    </Tag>
  );
};

export default DifficultyBadge;
