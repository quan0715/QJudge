import { CheckmarkFilled, CloseFilled, InProgress } from "@carbon/icons-react";
import type { HeaderInfo } from "./utils";

export const getHeaderStatusIcon = (type: HeaderInfo["type"]) => {
  switch (type) {
    case "green":
      return (
        <CheckmarkFilled
          size={24}
          fill="var(--cds-support-success)"
        />
      );
    case "red":
      return (
        <CloseFilled
          size={24}
          fill="var(--cds-support-error)"
        />
      );
    case "blue":
      return (
        <InProgress
          size={24}
          fill="var(--cds-support-info)"
        />
      );
    default:
      return null;
  }
};
