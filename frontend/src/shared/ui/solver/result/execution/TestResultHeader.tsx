import React, { useState } from "react";
import { Stack } from "@carbon/react";
import { useInterval } from "@/shared/hooks/useInterval";
import { getHeaderStatusIcon } from "./StatusHelpers";
import type { HeaderInfo } from "./utils";

interface TestResultHeaderProps {
  header: HeaderInfo;
  isPending: boolean;
  /** Client time (ms) the run started; shown as the waiting seconds while pending. */
  startedAt?: number;
}

const WaitingSeconds: React.FC<{ startedAt: number }> = ({ startedAt }) => {
  const [now, setNow] = useState(() => Date.now());
  useInterval(() => setNow(Date.now()), 1000);
  return <>{`已等待 ${Math.max(0, Math.floor((now - startedAt) / 1000))} 秒`}</>;
};

export const TestResultHeader: React.FC<TestResultHeaderProps> = ({
  header,
  isPending,
  startedAt,
}) => {
  const getStatusIcon = () => getHeaderStatusIcon(header.type);

  const getThemeVars = (type: HeaderInfo["type"]) => {
    switch (type) {
      case "green":
        return {
          bg: "var(--cds-notification-background-success)",
          text: "var(--cds-text-primary)",
          border: "var(--cds-support-success)"
        };
      case "red":
        return {
          bg: "var(--cds-notification-background-error)",
          text: "var(--cds-text-primary)",
          border: "var(--cds-support-error)"
        };
      case "blue":
        return {
          bg: "var(--cds-notification-background-info)",
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
          {isPending ? startedAt !== undefined && <WaitingSeconds startedAt={startedAt} /> : header.subtitle}
        </span>
        </Stack>
      </Stack>
    </div>
  );
};

export default TestResultHeader;
