import React from "react";
import { Tag } from "@carbon/react";
import {
  CheckmarkFilled,
  CloseFilled,
  Time,
  Warning,
  InProgress,
} from "@carbon/icons-react";
import { getStatusConfig } from "@/core/config/status.config";
import type {
  SubmissionStatus,
  TestCaseStatus,
} from "@/core/entities/submission.entity";

// =====================================================
// SubmissionStatusBadge - Tag component
// =====================================================

export interface SubmissionStatusBadgeProps {
  /** Submission status or test case result status */
  status: SubmissionStatus | TestCaseStatus | string;
  /** Badge size */
  size?: "sm" | "md";
  /** Additional CSS class */
  className?: string;
}

/**
 * Unified badge for displaying submission status or test case result status.
 * Supports all SubmissionStatus values (AC, WA, TLE, etc.) and TestCaseStatus (passed, failed, pending).
 */
export const SubmissionStatusBadge: React.FC<SubmissionStatusBadgeProps> = ({
  status,
  size = "md",
  className,
}) => {
  const config = getStatusConfig(status as SubmissionStatus);
  return (
    <Tag
      type={config.type}
      size={size}
      className={className}
      title={config.label}
    >
      {config.label}
    </Tag>
  );
};

// =====================================================
// SubmissionStatusIcon - Icon component
// =====================================================

export interface SubmissionStatusIconProps {
  /** Submission status or test case result status */
  status: SubmissionStatus | TestCaseStatus | string;
  /** Icon size in pixels */
  size?: number;
  /** Additional CSS class */
  className?: string;
}

const STATUS_ICON_CONFIG: Record<
  string,
  {
    icon: React.ComponentType<{
      size: number;
      className?: string;
      fill?: string;
    }>;
    color: string;
  }
> = {
  // Test case result statuses
  passed: { icon: CheckmarkFilled, color: "var(--cds-support-success)" },
  failed: { icon: CloseFilled, color: "var(--cds-support-error)" },
  pending: { icon: Time, color: "var(--cds-text-secondary)" },
  // Submission statuses
  AC: { icon: CheckmarkFilled, color: "var(--cds-support-success)" },
  WA: { icon: CloseFilled, color: "var(--cds-support-error)" },
  TLE: { icon: Time, color: "var(--cds-support-warning)" },
  MLE: { icon: Warning, color: "var(--cds-support-warning)" },
  RE: { icon: CloseFilled, color: "var(--cds-support-error)" },
  CE: { icon: CloseFilled, color: "var(--cds-support-error)" },
  KR: { icon: CloseFilled, color: "var(--cds-support-error)" },
  SE: { icon: Warning, color: "var(--cds-support-error)" },
  NS: { icon: Time, color: "var(--cds-text-secondary)" },
  judging: { icon: InProgress, color: "var(--cds-support-info)" },
};

/**
 * Icon component for displaying submission status or test case result status.
 * Provides visual feedback with appropriate icons and colors.
 */
export const SubmissionStatusIcon: React.FC<SubmissionStatusIconProps> = ({
  status,
  size = 16,
  className,
}) => {
  const config = STATUS_ICON_CONFIG[status] || STATUS_ICON_CONFIG.pending;
  const IconComponent = config.icon;

  return (
    <IconComponent size={size} className={className} fill={config.color} />
  );
};
