import { Tag } from "@carbon/react";
import { useTranslation } from "react-i18next";
import type { BatchQuestionStatus } from "./batchGradingModel";

type TagType = "gray" | "blue" | "magenta" | "green" | "red" | "warm-gray" | "purple";

const STATUS_TAG: Partial<Record<BatchQuestionStatus, { type: TagType; key: string }>> = {
  queued: { type: "gray", key: "queued" },
  running: { type: "blue", key: "running" },
  "awaiting-approval": { type: "magenta", key: "awaitingApproval" },
  completed: { type: "green", key: "completed" },
  failed: { type: "red", key: "failed" },
  cancelled: { type: "warm-gray", key: "cancelled" },
};

export function BatchStatusTag({ status }: { status: BatchQuestionStatus }) {
  const { t } = useTranslation("contest");
  const config = STATUS_TAG[status];
  if (!config) return null;
  return (
    <Tag type={config.type} size="sm">
      {t(`grading.batch.status.${config.key}`)}
    </Tag>
  );
}
