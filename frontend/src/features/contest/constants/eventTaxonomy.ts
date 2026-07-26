/** Presentation helpers for backend-projected event metadata. */
import {
  CheckmarkFilled,
  Chat,
  Locked,
  View,
  WarningFilled,
  Policy,
  Information,
  Time,
  WarningAlt,
  ImageSearch,
} from "@carbon/icons-react";

const humanizeEventType = (eventType: string): string =>
  eventType.replaceAll("_", " ");

type TranslateFn = (key: string, defaultValue: string) => unknown;

export const getEventTypeLabel = (
  t: TranslateFn,
  eventType: string,
): string => {
  const translated = String(t(`logs.eventTypes.${eventType}`, eventType));
  return translated !== eventType ? translated : humanizeEventType(eventType);
};

export const getPriorityIcon = (priority: number) => {
  if (priority === 0) return WarningFilled;
  if (priority === 1) return Policy;
  if (priority === 2) return Information;
  return Time;
};

export const getEventTypeIcon = (eventType: string, priority: number) => {
  if (eventType.includes("screen_share")) return View;
  if (eventType.includes("webcam")) return ImageSearch;
  if (eventType.includes("mouse_leave")) return WarningAlt;
  if (
    eventType.includes("multi_display") ||
    eventType.includes("multiple_displays") ||
    eventType.includes("split_view") ||
    eventType.includes("viewport")
  )
    return View;
  if (eventType.includes("lock")) return Locked;
  if (eventType.includes("restored") || eventType.includes("unlock"))
    return CheckmarkFilled;
  if (eventType.includes("ask_question") || eventType.includes("reply_question"))
    return Chat;
  return getPriorityIcon(priority);
};
