import { z } from "zod";

/**
 * Zod validation schema for problem form
 * 
 * Required fields:
 * - title: 題目名稱
 * - difficulty: 難度
 * - timeLimit: 時間限制
 * - memoryLimit: 記憶體限制
 * 
 * Optional fields: All content fields, test cases, language configs, etc.
 */
export const problemFormSchema = z.object({
  // Basic Info - Required
  title: z.string().min(1, { message: "題目名稱為必填" }),
  difficulty: z.enum(["easy", "medium", "hard"]),
  timeLimit: z
    .number()
    .min(100, { message: "時間限制至少 100ms" })
    .max(60000, { message: "時間限制最多 60000ms" }),
  memoryLimit: z
    .number()
    .min(16, { message: "記憶體限制至少 16MB" })
    .max(1024, { message: "記憶體限制最多 1024MB" }),
  isVisible: z.boolean(),
  existingTagIds: z.array(z.number()),

  // Content - Translations (all fields are strings, empty allowed)
  translationZh: z.object({
    title: z.string(),
    description: z.string(),
    inputDescription: z.string(),
    outputDescription: z.string(),
    hint: z.string(),
  }),
  translationEn: z.object({
    title: z.string(),
    description: z.string(),
    inputDescription: z.string(),
    outputDescription: z.string(),
    hint: z.string(),
  }),

  // Test Cases
  testCases: z.array(
    z.object({
      input: z.string(),
      expectedOutput: z.string(),
      isHidden: z.boolean().optional(),
      score: z.number().optional(),
    })
  ),

  // Language Config
  languageConfigs: z.array(
    z.object({
      language: z.string(),
      isEnabled: z.boolean(),
      templateCode: z.string().optional(),
    })
  ),

  // Code Restrictions - Optional
  forbiddenKeywords: z.array(z.string()),
  requiredKeywords: z.array(z.string()),
});

export type ProblemFormSchemaType = z.infer<typeof problemFormSchema>;

/**
 * Get validation errors for a specific section
 */
export type SectionId = "basic-info" | "content" | "test-cases" | "language-config" | "danger-zone";

/**
 * Map of section IDs to their field paths
 */
export const SECTION_FIELDS: Record<SectionId, string[]> = {
  "basic-info": ["title", "difficulty", "timeLimit", "memoryLimit", "existingTagIds"],
  "content": [
    "translationZh.title",
    "translationZh.description",
    "translationZh.inputDescription",
    "translationZh.outputDescription",
    "translationZh.hint",
    "translationEn.title",
    "translationEn.description",
    "translationEn.inputDescription",
    "translationEn.outputDescription",
    "translationEn.hint",
  ],
  "test-cases": ["testCases"],
  "language-config": ["languageConfigs", "forbiddenKeywords", "requiredKeywords"],
  "danger-zone": ["isVisible"],
};

/**
 * Get the section ID for a given field path
 */
export function getSectionForField(fieldPath: string): SectionId | null {
  for (const [sectionId, fields] of Object.entries(SECTION_FIELDS)) {
    if (fields.some((f) => fieldPath === f || fieldPath.startsWith(f + "."))) {
      return sectionId as SectionId;
    }
  }
  return null;
}
