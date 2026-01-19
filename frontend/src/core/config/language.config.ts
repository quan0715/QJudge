
export type LanguageConfigEntry = {
  field: string;
  label: string;
};

export const LANGUAGE_CONFIG = {
  cpp: {
    field: "cpp",
    label: "C++",
  },
  python: {
    field: "python",
    label: "Python",
  },
  java: {
    field: "java",
    label: "Java",
  },
  javascript: {
    field: "javascript",
    label: "JavaScript",
  },
  c: {
    field: "c",
    label: "C",
  },
} as const;

export type LanguageKey = keyof typeof LANGUAGE_CONFIG;

export function getLanguageConfig(
  language: LanguageKey | string
): LanguageConfigEntry {
  return LANGUAGE_CONFIG[language as LanguageKey] || {
    field: language,
    label: language,
  };
}

/**
 * Language options for editor dropdown
 */
export interface LanguageOption {
  id: string;
  label: string;
}

/**
 * Available language options for the code editor
 */
export const LANGUAGE_OPTIONS: LanguageOption[] = Object.entries(LANGUAGE_CONFIG).map(
  ([id, config]) => ({
    id,
    label: config.label,
  })
);
