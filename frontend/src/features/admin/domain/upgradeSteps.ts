import type { UpgradeStep } from "@/core/entities/systemVersion.entity";

/** Step names as shown to admins when no translation is loaded. */
export const UPGRADE_STEP_LABELS: Record<UpgradeStep, string> = {
  prepare: "下載新版並檢查設定",
  build: "建置映像檔",
  backup: "備份資料庫",
  migrate: "資料庫遷移",
  switch: "切換服務",
  verify: "健康檢查",
};
