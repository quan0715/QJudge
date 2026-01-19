import React from "react";
import { Tag, type TagProps } from "@carbon/react";
import "./TagStyle.scss";

export interface CategoryTagProps {
  labels: string[];
  maxVisible?: number;
  emptyLabel?: string;
  type?: TagProps<"span">["type"];
  size?: TagProps<"span">["size"];
  className?: string;
}

export const CategoryTag: React.FC<CategoryTagProps> = ({
  labels,
  maxVisible = 3,
  emptyLabel = "",
  type = "cool-gray",
  size = "md",
  className,
}) => {
  const visible = labels.slice(0, maxVisible);
  const overflow = labels.length - visible.length;

  if (labels.length === 0) {
    return (
      <span
        className={className}
        style={{ color: "var(--cds-text-secondary)" }}
      >
        {emptyLabel}
      </span>
    );
  }

  return (
    <div className={className ? `${className} tag-line` : "tag-line"}>
      {visible.map((label) => (
        <Tag key={label} type={type} size={size}>
          {label}
        </Tag>
      ))}
      {overflow > 0 && (
        <Tag type="gray" size={size}>
          +{overflow}
        </Tag>
      )}
    </div>
  );
};

export default CategoryTag;
