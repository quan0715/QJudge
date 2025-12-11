import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Chinese Traditional
import zhTWCommon from "./locales/zh-TW/common.json";
import zhTWProblem from "./locales/zh-TW/problem.json";
import zhTWContest from "./locales/zh-TW/contest.json";
import zhTWAdmin from "./locales/zh-TW/admin.json";

// English
import enCommon from "./locales/en/common.json";
import enProblem from "./locales/en/problem.json";
import enContest from "./locales/en/contest.json";
import enAdmin from "./locales/en/admin.json";

// Japanese
import jaCommon from "./locales/ja/common.json";
import jaProblem from "./locales/ja/problem.json";
import jaContest from "./locales/ja/contest.json";
import jaAdmin from "./locales/ja/admin.json";

// Korean
import koCommon from "./locales/ko/common.json";
import koProblem from "./locales/ko/problem.json";
import koContest from "./locales/ko/contest.json";
import koAdmin from "./locales/ko/admin.json";

const resources = {
  "zh-TW": {
    common: zhTWCommon,
    problem: zhTWProblem,
    contest: zhTWContest,
    admin: zhTWAdmin,
  },
  en: {
    common: enCommon,
    problem: enProblem,
    contest: enContest,
    admin: enAdmin,
  },
  ja: {
    common: jaCommon,
    problem: jaProblem,
    contest: jaContest,
    admin: jaAdmin,
  },
  ko: {
    common: koCommon,
    problem: koProblem,
    contest: koContest,
    admin: koAdmin,
  },
};

// Supported languages list for UI
export const SUPPORTED_LANGUAGES = [
  { id: "zh-TW", label: "繁體中文", shortLabel: "中" },
  { id: "en", label: "English", shortLabel: "EN" },
  { id: "ja", label: "日本語", shortLabel: "日" },
  { id: "ko", label: "한국어", shortLabel: "한" },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]["id"];

i18n.use(initReactI18next).init({
  resources,
  lng: "zh-TW",
  fallbackLng: "zh-TW",
  ns: ["common", "problem", "contest", "admin"],
  defaultNS: "common",
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export default i18n;
