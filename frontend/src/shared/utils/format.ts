import type { Difficulty } from "@/core/entities/problem.entity";
import type { LanguageKey } from "@/core/config/language.config";
import { formatDistanceToNow } from "date-fns";
import { zhTW } from "date-fns/locale";

// ============================================================================
// Date Formatting
// ============================================================================

export interface FormatDateOptions {
  /** Include year in output (default: true) */
  includeYear?: boolean;
  /** Include seconds in output (default: true) */
  includeSeconds?: boolean;
}

/**
 * Format a date string into a localized string (zh-TW)
 * @param dateString The ISO date string to format
 * @param options Formatting options
 * @returns Formatted date string
 */
const formatDate = (
  dateString: string,
  options: FormatDateOptions = {}
): string => {
  const { includeYear = true, includeSeconds = true } = options;
  const date = new Date(dateString);

  const formatOptions: Intl.DateTimeFormatOptions = {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  };

  if (includeYear) {
    formatOptions.year = "numeric";
  }

  if (includeSeconds) {
    formatOptions.second = "2-digit";
  }

  return date.toLocaleString("zh-TW", formatOptions);
};

/**
 * Format a date string to relative time (e.g., "3 分鐘前")
 * @param dateString The ISO date string to format
 * @returns Relative time string
 */
const formatRelativeTime = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    return formatDistanceToNow(date, { addSuffix: true, locale: zhTW });
  } catch {
    return dateString;
  }
};

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Smart time formatting:
 * - Within 24 hours: show relative time (e.g., "30 分鐘前")
 * - Beyond 24 hours: show actual date/time
 * @param dateString The ISO date string to format
 * @returns Formatted time string
 */
const formatSmartTime = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < TWENTY_FOUR_HOURS_MS) {
      // Within 24 hours - show relative time
      return formatDistanceToNow(date, { addSuffix: true, locale: zhTW });
    } else {
      // Beyond 24 hours - show actual date/time (without year if same year)
      const isSameYear = date.getFullYear() === now.getFullYear();
      return formatDate(dateString, {
        includeYear: !isSameYear,
        includeSeconds: false,
      });
    }
  } catch {
    return dateString;
  }
};

// ============================================================================
// Label Mappings
// ============================================================================

/**
 * Get display label for programming language
 */
const getLanguageLabel = (lang: LanguageKey | string): string => {
  const langMap: Record<string, string> = {
    cpp: "C++",
    "c++": "C++",
    python: "Python",
    java: "Java",
    javascript: "JavaScript",
    js: "JavaScript",
    c: "C",
    go: "Go",
    rust: "Rust",
    typescript: "TypeScript",
    ts: "TypeScript",
  };
  return langMap[lang.toLowerCase()] || lang;
};

/**
 * Get display label for difficulty
 */
const getDifficultyLabel = (diff: Difficulty): string => {
  const diffMap: Record<Difficulty, string> = {
    easy: "Easy",
    medium: "Medium",
    hard: "Hard",
  };
  return diffMap[diff] || diff;
};

export {
  formatDate,
  formatRelativeTime,
  formatSmartTime,
  getLanguageLabel,
  getDifficultyLabel,
};
