import React from "react";
import { Tile, Layer } from "@carbon/react";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  action,
  children,
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      minHeight: 200,
      padding: "2rem",
    }}
  >
    <Layer>
      <Tile style={{ textAlign: "center", maxWidth: 360 }}>
        <p
          style={{
            fontSize: "0.875rem",
            fontWeight: 500,
            color: "var(--cds-text-primary)",
            marginBottom: description ? "0.5rem" : 0,
          }}
        >
          {title}
        </p>
        {description && (
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--cds-text-secondary)",
              lineHeight: 1.5,
            }}
          >
            {description}
          </p>
        )}
        {children}
        {action && <div style={{ marginTop: "1rem" }}>{action}</div>}
      </Tile>
    </Layer>
  </div>
);

export default EmptyState;
