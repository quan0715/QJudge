import React from "react";
import { Tag } from "@carbon/react";

interface ProblemTag {
  id: string | number;
  name: string;
  color?: string | null;
}

interface ProblemTagListProps {
  tags?: ProblemTag[];
  size?: "sm" | "md";
  emptyLabel?: string;
}

const ProblemTagList: React.FC<ProblemTagListProps> = ({
  tags,
  size,
  emptyLabel = "-",
}) => {
  if (!tags || tags.length === 0) {
    return (
      <span
        style={{
          color: "var(--cds-text-secondary)",
          fontSize: "0.875rem",
        }}
      >
        {emptyLabel}
      </span>
    );
  }

  return (
    <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
      {tags.map((tag) => (
        <Tag
          key={tag.id}
          type="outline"
          size={size}
          style={
            tag.color
              ? {
                  backgroundColor: `${tag.color}15`,
                  color: tag.color,
                  borderColor: tag.color,
                }
              : undefined
          }
        >
          {tag.name}
        </Tag>
      ))}
    </div>
  );
};

export default ProblemTagList;
