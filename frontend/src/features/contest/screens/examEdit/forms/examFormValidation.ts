import { z } from "zod";

export const examFormSchema = z
  .object({
    // Basic info
    name: z.string().min(1, "考試名稱為必填"),
    description: z.string(),
    rules: z.string(),
    startTime: z.string().min(1, "開始時間為必填"),
    endTime: z.string().min(1, "結束時間為必填"),
    status: z.enum(["draft", "published", "archived"]),
    visibility: z.enum(["public", "private"]),
    password: z.string(),
    // Exam settings
    examModeEnabled: z.boolean(),
    maxCheatWarnings: z.number().min(0).max(10),
    allowMultipleJoins: z.boolean(),
    allowAutoUnlock: z.boolean(),
    autoUnlockMinutes: z.number().min(1).max(1440),
  })
  .refine(
    (data) => {
      if (!data.startTime || !data.endTime) return true;
      return new Date(data.startTime) < new Date(data.endTime);
    },
    { message: "開始時間必須早於結束時間", path: ["endTime"] }
  );

export type ExamSectionId =
  | "basic-info"
  | "exam-settings"
  | "exam-questions"
  | "scoring-summary"
  | "danger-zone";

export const SECTION_FIELDS: Record<ExamSectionId, string[]> = {
  "basic-info": [],
  "exam-settings": [],
  "exam-questions": [],
  "scoring-summary": [],
  "danger-zone": [],
};
