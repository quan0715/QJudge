import i18n from './index';

/**
 * Options for date formatting
 */
export interface DateFormatOptions extends Intl.DateTimeFormatOptions {
  /** Optional override for locale */
  locale?: string;
}

/**
 * Common date formats used in the app
 */
export const DATE_FORMATS = {
  /** Example: Mar 10, 08:30 or 3月10日 08:30 */
  SHORT: {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  } as const,
  
  /** Example: 2026-03-10 08:30:45 */
  FULL: {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  } as const,

  /** Example: 2026/03/10 */
  DATE_ONLY: {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  } as const,

  /** Example: 08:30:45 */
  TIME_ONLY: {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  } as const,
};

/**
 * Format a date string or object using current i18n locale
 */
export const formatDateTime = (
  date: string | number | Date | null | undefined,
  options: DateFormatOptions = DATE_FORMATS.SHORT
): string => {
  if (!date) return '';
  
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  
  if (isNaN(d.getTime())) return '';

  const { locale, ...intlOptions } = options;
  const currentLocale = locale || i18n.language || 'zh-TW';
  
  try {
    return new Intl.DateTimeFormat(currentLocale, intlOptions).format(d);
  } catch (e) {
    console.error('Failed to format date:', e);
    return d.toLocaleString();
  }
};

/**
 * Custom formatter for specific business needs
 * e.g., "Starts in 2 hours" or specific countdown logic
 */
export const formatRelativeTime = (
  date: string | number | Date,
  _baseDate: Date = new Date()
): string => {
  // This could be expanded with Intl.RelativeTimeFormat if needed
  // For now we keep it simple or integrate with existing countdown logic
  return formatDateTime(date);
};
