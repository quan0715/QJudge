export interface SupportedLanguageOption {
  readonly id: string;
  readonly label: string;
  readonly shortLabel: string;
}

export const SUPPORTED_LANGUAGES = [
  { id: "zh-TW", label: "繁體中文", shortLabel: "中" },
  { id: "en", label: "English", shortLabel: "EN" },
  { id: "ja", label: "日本語", shortLabel: "日" },
  { id: "ko", label: "한국어", shortLabel: "한" },
] as const satisfies ReadonlyArray<SupportedLanguageOption>;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]["id"];
