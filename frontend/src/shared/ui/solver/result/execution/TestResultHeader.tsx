import React from "react";
import { Stack, SkeletonText } from "@carbon/react";
import { getHeaderStatusIcon } from "./StatusHelpers";
import type { HeaderInfo } from "./utils";

interface TestResultHeaderProps {
  header: HeaderInfo;
  isPending: boolean;
}

export const TestResultHeader: React.FC<TestResultHeaderProps> = ({
  header,
  isPending,
}) => {
  const getStatusIcon = () => getHeaderStatusIcon(header.type);

  const getThemeVars = (type: HeaderInfo["type"]) => {
    switch (type) {
      case "green":
        return {
          bg: "var(--cds-support-success-highlight)",
          text: "var(--cds-text-primary)",
          border: "var(--cds-support-success)"
        };
      case "red":
        return {
          bg: "var(--cds-support-error-highlight)",
          text: "var(--cds-text-primary)",
          border: "var(--cds-support-error)"
        };
      case "blue":
        return {
          bg: "var(--cds-support-info-highlight)",
          text: "var(--cds-text-primary)",
          border: "var(--cds-support-info)"
        };
      default:
        return {
          bg: "var(--cds-layer)",
          text: "var(--cds-text-primary)",
          border: "var(--cds-border-subtle)"
        };
    }
  };

  const theme = getThemeVars(header.type);

  return (
    <div
      style={{
        width: "100%",
        padding: "16px",
        flexShrink: 0,
        transition: "background-color 200ms ease-in-out"
      }}
    >
      {isPending ? (
        <Stack gap={2} style={{ minHeight: "2.5rem", alignItems: "start", justifyContent: "start" }}>
          <SkeletonText width="160px" heading />
          <SkeletonText width="100px" />
        </Stack>
      ) : (
        <Stack
          orientation="horizontal"
          gap={4}
          style={{ 
            width: "100%",
            alignItems: "center", 
            justifyContent: "flex-start",
            textAlign: "start",
          }}
        >
          {getStatusIcon()}
          <Stack orientation="vertical" gap={3} style={{ alignItems: "center" }}>
            <h3 style={{ 
              margin: 0, 
              fontSize: "1.25rem", 
              fontWeight: 600,
              lineHeight: 1.25,
              color: theme.text
            }}>
              {header.title}
            </h3>
            <span style={{ 
            fontSize: "0.875rem", 
            color: "var(--cds-text-secondary)",
            lineHeight: 1.25
          }}>
            {header.subtitle}
          </span>
          </Stack>
        </Stack>
      )}
    </div>
  );
};

export default TestResultHeader;
