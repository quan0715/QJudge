import { createContext, useContext } from "react";

export type ExamMonitoringReminderTone = "warning" | "critical";

export interface ExamMonitoringReminder {
  source: string;
  tone: ExamMonitoringReminderTone;
  countdownSeconds: number | null;
}

const ExamMonitoringStatusContext =
  createContext<ExamMonitoringReminder | null>(null);

export const ExamMonitoringStatusProvider =
  ExamMonitoringStatusContext.Provider;

export const useExamMonitoringStatus = () =>
  useContext(ExamMonitoringStatusContext);
