import React from "react";

interface ContainerCardProps {
  children: React.ReactNode;
  title?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  noPadding?: boolean;
}

const ContainerCard: React.FC<ContainerCardProps> = ({
  children,
  title,
  action,
  className,
  style,
  noPadding = false,
}) => {
  return (
    <div
      className={className}
      style={{
        backgroundColor: "var(--cds-layer-02)",
        border: "1px solid var(--cds-border-subtle)",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      {(title || action) && (
        <div
          style={{
            minHeight: "3rem", // Match Carbon header height
            borderBottom: "1px solid var(--cds-border-strong-01)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "stretch", // Stretch to fill height
          }}
        >
          {title && (
            <h4
              style={{
                margin: 0,
                fontSize: "1rem",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                paddingLeft: "1rem",
              }}
            >
              {title}
            </h4>
          )}
          {action && (
            <div
              style={{
                display: "flex",
                alignItems: "stretch", // Actions fill height
                marginLeft: "auto",
              }}
            >
              {action}
            </div>
          )}
        </div>
      )}
      <div
        style={{
          padding: noPadding ? 0 : "1rem",
          flex: 1,
          overflow: "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default ContainerCard;
