import { Tag } from "@carbon/react";
import type { StatusConfig } from "@/core/config/status.config";

export function SubmissionVerdictTag({ status, className }: { status: string; className?: string }) {
    const statusConfig: Record<string, { type: StatusConfig["type"]; label: string }> = {
      AC: { type: "green", label: "AC" },
      WA: { type: "red", label: "WA" },
      TLE: { type: "magenta", label: "TLE" },
      MLE: { type: "magenta", label: "MLE" },
      RE: { type: "red", label: "RE" },
      CE: { type: "gray", label: "CE" },
      pending: { type: "gray", label: "Pending" },
      judging: { type: "blue", label: "Judging" },
      SE: { type: "red", label: "SE" },
  }

    const config = statusConfig[status] || { type: "gray", label: status };
    return (
      <Tag type={config.type} size="sm" className={className}>
        {config.label}
      </Tag>
    );
}
