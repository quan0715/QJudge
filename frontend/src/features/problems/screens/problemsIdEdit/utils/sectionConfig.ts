import type { SectionValidationState, NavSection } from "../section/layout";

export const BASE_SECTIONS: NavSection[] = [
  { id: "basic-info", label: "基本資訊" },
  { id: "content", label: "題目內容" },
  { id: "test-cases", label: "測試案例" },
  { id: "language-config", label: "語言設定" },
  { id: "danger-zone", label: "Danger Zone" },
];

/**
 * Get validation state for a section based on form errors
 */
export function getSectionValidationState(
  sectionId: string,
  errors: Record<string, unknown>,
  touchedFields: Record<string, unknown>
): { state: SectionValidationState; errorCount: number } {
  const sectionFieldMap: Record<string, string[]> = {
    "basic-info": ["title", "difficulty", "timeLimit", "memoryLimit"],
    content: ["translationZh", "translationEn"],
    "test-cases": ["testCases"],
    "language-config": ["languageConfigs", "forbiddenKeywords", "requiredKeywords"],
    "danger-zone": ["isVisible"],
  };

  const fields = sectionFieldMap[sectionId] || [];
  let errorCount = 0;
  let hasTouched = false;

  for (const field of fields) {
    if (errors[field]) {
      errorCount++;
    }
    if (touchedFields[field]) {
      hasTouched = true;
    }
  }

  if (errorCount > 0) {
    return { state: "invalid", errorCount };
  }
  if (hasTouched) {
    return { state: "valid", errorCount: 0 };
  }
  return { state: "none", errorCount: 0 };
}
