import type { TFunction } from "i18next";
import { formatDateTime, DATE_FORMATS } from "@/i18n/dateUtils";

export const formatExamTime = (value: string) => formatDateTime(value, DATE_FORMATS.SHORT);

/** Exam window length in the largest sensible units, e.g. "30 天 1 小時". */
export function formatExamDuration(totalMinutes: number, t: TFunction<"contest">) {
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return t("workspace.overview.durationDays", `${days} 天 ${hours} 小時`, { days, hours });
  if (hours > 0) return t("workspace.overview.durationHours", `${hours} 小時 ${minutes} 分`, { hours, minutes });
  return t("workspace.overview.minutes", `${minutes} 分鐘`, { count: minutes });
}
