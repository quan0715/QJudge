export type ContestDateInput = Date | number | string | null | undefined;

export const parseContestDate = (value: ContestDateInput): Date | null => {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatContestClockTime = (
  value: ContestDateInput,
  locale?: string,
  options: {
    fallback?: string;
    includeSeconds?: boolean;
    hour12?: boolean;
    timeZone?: string;
  } = {},
): string => {
  const date = parseContestDate(value);
  if (!date) return options.fallback ?? "";
  const formatOptions: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    ...(options.includeSeconds ? { second: "2-digit" } : {}),
    ...(options.hour12 !== undefined ? { hour12: options.hour12 } : {}),
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  };
  return new Intl.DateTimeFormat(locale, formatOptions).format(date);
};

export const formatContestMonthDay = (
  value: ContestDateInput,
  locale?: string,
  fallback = "",
): string => {
  const date = parseContestDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

export const formatContestDateTime = (
  value: ContestDateInput,
  locale?: string,
  fallback = "",
): string => {
  const date = parseContestDate(value);
  if (!date) return fallback;
  return date.toLocaleString(locale);
};

export const formatContestCountdownDuration = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
};

export const formatContestCompactDuration = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
};
