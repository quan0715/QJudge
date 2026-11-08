import { Tag } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { translateVerdict, type StatusConfig } from "@/core/config/status.config";

const TAG_TYPES: Record<string, StatusConfig["type"]> = {
  AC: "green",
  WA: "red",
  TLE: "magenta",
  MLE: "magenta",
  RE: "red",
  CE: "gray",
  SE: "red",
  KR: "red",
  pending: "gray",
  judging: "blue",
};

/** The verdict in words, as the result panel shows it; the judge code stays in the tooltip. */
export function SubmissionVerdictTag({ status, className }: { status: string; className?: string }) {
  const { t } = useTranslation();
  const label = status === "pending"
    ? t("solver.queued", "排隊中")
    : status === "judging"
      ? t("solver.judging", "判題中")
      : translateVerdict(t, status);
  return (
    <Tag type={TAG_TYPES[status] ?? "gray"} size="sm" className={className} title={status}>
      {label}
    </Tag>
  );
}
