import i18next, { type i18n as I18nInstance, type Resource } from "i18next";
import { initReactI18next } from "react-i18next";

import zhTWDocs from "@/i18n/locales/zh-TW/docs.json";
import enDocs from "@/i18n/locales/en/docs.json";
import jaDocs from "@/i18n/locales/ja/docs.json";
import koDocs from "@/i18n/locales/ko/docs.json";

const DEFAULT_COMMON_RESOURCES = {
  "zh-TW": {
    language: {
      title: "語言",
      select: "選擇語言",
      selectLanguage: "選擇語言",
    },
    theme: {
      title: "主題",
      select: "選擇主題",
      light: "淺色",
      dark: "深色",
      system: "跟隨系統",
    },
  },
  en: {
    language: {
      title: "Language",
      select: "Select Language",
      selectLanguage: "Select Language",
    },
    theme: {
      title: "Theme",
      select: "Select Theme",
      light: "Light",
      dark: "Dark",
      system: "System",
    },
  },
  ja: {
    language: {
      title: "言語",
      select: "言語を選択",
      selectLanguage: "言語を選択",
    },
    theme: {
      title: "テーマ",
      select: "テーマを選択",
      light: "ライト",
      dark: "ダーク",
      system: "システム",
    },
  },
  ko: {
    language: {
      title: "언어",
      select: "언어 선택",
      selectLanguage: "언어 선택",
    },
    theme: {
      title: "테마",
      select: "테마 선택",
      light: "라이트",
      dark: "다크",
      system: "시스템",
    },
  },
} as const;

export const DEFAULT_DOCS_RESOURCES: Resource = {
  "zh-TW": {
    common: DEFAULT_COMMON_RESOURCES["zh-TW"],
    docs: zhTWDocs,
  },
  en: {
    common: DEFAULT_COMMON_RESOURCES.en,
    docs: enDocs,
  },
  ja: {
    common: DEFAULT_COMMON_RESOURCES.ja,
    docs: jaDocs,
  },
  ko: {
    common: DEFAULT_COMMON_RESOURCES.ko,
    docs: koDocs,
  },
};

export interface CreateDocsI18nOptions {
  resources?: Resource;
  defaultLanguage?: string;
  fallbackLanguage?: string;
}

/**
 * Create an isolated i18next instance containing only docs and minimal UI switcher locales.
 */
export function createDocsI18n(
  options: CreateDocsI18nOptions = {},
): I18nInstance {
  const instance = i18next.createInstance();
  const defaultLanguage = options.defaultLanguage ?? "zh-TW";
  const fallbackLanguage = options.fallbackLanguage ?? "zh-TW";

  void instance.use(initReactI18next).init({
    resources: options.resources ?? DEFAULT_DOCS_RESOURCES,
    lng: defaultLanguage,
    fallbackLng: fallbackLanguage,
    ns: ["common", "docs"],
    defaultNS: "common",
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

  return instance;
}
