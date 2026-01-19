import { Button, Tile } from "@carbon/react";
import type { ReactNode } from "react";

interface ActionProps {
  label: string;
  onClick: () => void;
}

interface DiscussionsSectionProps {
  title: string;
  subtitle?: string;
  action?: ActionProps;
  children: ReactNode;
}

/**
 * 討論區塊容器
 * 組合多個 ProblemDiscussionThread，提供標題、副標題與動作按鈕
 */
export const DiscussionsSection = ({ title, subtitle, action, children }: DiscussionsSectionProps) => {
  return (
    <Tile>
      <div style={{ marginBottom: "0.75rem", display: "flex", justifyContent: "space-between", gap: "1rem" }}>
        <div>
          <h4 style={{ margin: 0 }}>{title}</h4>
          {subtitle && (
            <p style={{ margin: "0.25rem 0 0", color: "var(--cds-text-secondary)" }}>
              {subtitle}
            </p>
          )}
        </div>
        {action && (
          <div style={{ flexShrink: 0 }}>
            <Button kind="ghost" size="sm" onClick={action.onClick}>
              {action.label}
            </Button>
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>{children}</div>
    </Tile>
  );
};

export default DiscussionsSection;
