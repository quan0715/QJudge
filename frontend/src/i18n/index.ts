import i18n from "i18next";
import { initReactI18next } from "react-i18next";
export {
  SUPPORTED_LANGUAGES,
  type SupportedLanguageOption,
  type SupportedLanguage,
} from "./languages";

// Chinese Traditional
import zhTWCommon from "./locales/zh-TW/common.json";
import zhTWProblem from "./locales/zh-TW/problem.json";
import zhTWContest from "./locales/zh-TW/contest.json";
import zhTWAdmin from "./locales/zh-TW/admin.json";
import zhTWClassroom from "./locales/zh-TW/classroom.json";
import zhTWChatbot from "./locales/zh-TW/chatbot.json";

// English
import enCommon from "./locales/en/common.json";
import enProblem from "./locales/en/problem.json";
import enContest from "./locales/en/contest.json";
import enAdmin from "./locales/en/admin.json";
import enClassroom from "./locales/en/classroom.json";
import enChatbot from "./locales/en/chatbot.json";

// Japanese
import jaCommon from "./locales/ja/common.json";
import jaProblem from "./locales/ja/problem.json";
import jaContest from "./locales/ja/contest.json";
import jaAdmin from "./locales/ja/admin.json";
import jaClassroom from "./locales/ja/classroom.json";
import jaChatbot from "./locales/ja/chatbot.json";

// Korean
import koCommon from "./locales/ko/common.json";
import koProblem from "./locales/ko/problem.json";
import koContest from "./locales/ko/contest.json";
import koAdmin from "./locales/ko/admin.json";
import koClassroom from "./locales/ko/classroom.json";
import koChatbot from "./locales/ko/chatbot.json";

const resources = {
  "zh-TW": {
    common: zhTWCommon,
    problem: zhTWProblem,
    contest: zhTWContest,
    admin: zhTWAdmin,
    classroom: zhTWClassroom,
    chatbot: zhTWChatbot,
  },
  en: {
    common: enCommon,
    problem: enProblem,
    contest: enContest,
    admin: enAdmin,
    classroom: enClassroom,
    chatbot: enChatbot,
  },
  ja: {
    common: jaCommon,
    problem: jaProblem,
    contest: jaContest,
    admin: jaAdmin,
    classroom: jaClassroom,
    chatbot: jaChatbot,
  },
  ko: {
    common: koCommon,
    problem: koProblem,
    contest: koContest,
    admin: koAdmin,
    classroom: koClassroom,
    chatbot: koChatbot,
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: "zh-TW",
  fallbackLng: "zh-TW",
  ns: ["common", "problem", "contest", "admin", "classroom", "chatbot"],
  defaultNS: "common",
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export default i18n;
