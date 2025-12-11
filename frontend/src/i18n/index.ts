import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import zhTWCommon from './locales/zh-TW/common.json';
import zhTWProblem from './locales/zh-TW/problem.json';
import enCommon from './locales/en/common.json';
import enProblem from './locales/en/problem.json';

const resources = {
  'zh-TW': {
    common: zhTWCommon,
    problem: zhTWProblem,
  },
  en: {
    common: enCommon,
    problem: enProblem,
  },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'zh-TW',
    fallbackLng: 'zh-TW',
    ns: ['common', 'problem'],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
