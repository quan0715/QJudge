import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/i18n";

export type ContentLanguage = SupportedLanguage;

interface ContentLanguageContextType {
  contentLanguage: ContentLanguage;
  setContentLanguage: (lang: ContentLanguage) => void;
  toggleLanguage: () => void;
  supportedLanguages: typeof SUPPORTED_LANGUAGES;
  getCurrentLanguageLabel: () => string;
  getCurrentLanguageShortLabel: () => string;
}

const ContentLanguageContext = createContext<
  ContentLanguageContextType | undefined
>(undefined);

export const ContentLanguageProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const { i18n } = useTranslation();
  const [contentLanguage, setContentLanguageState] =
    useState<ContentLanguage>("zh-TW");

  const setContentLanguage = useCallback(
    (lang: ContentLanguage) => {
      setContentLanguageState(lang);
      i18n.changeLanguage(lang);
    },
    [i18n]
  );

  const toggleLanguage = useCallback(() => {
    setContentLanguageState((prev) => {
      const currentIndex = SUPPORTED_LANGUAGES.findIndex((l) => l.id === prev);
      const nextIndex = (currentIndex + 1) % SUPPORTED_LANGUAGES.length;
      const newLang = SUPPORTED_LANGUAGES[nextIndex].id;
      i18n.changeLanguage(newLang);
      return newLang;
    });
  }, [i18n]);

  const getCurrentLanguageLabel = useCallback(() => {
    return (
      SUPPORTED_LANGUAGES.find((l) => l.id === contentLanguage)?.label ||
      contentLanguage
    );
  }, [contentLanguage]);

  const getCurrentLanguageShortLabel = useCallback(() => {
    return (
      SUPPORTED_LANGUAGES.find((l) => l.id === contentLanguage)?.shortLabel ||
      contentLanguage
    );
  }, [contentLanguage]);

  const value = useMemo(
    () => ({
      contentLanguage,
      setContentLanguage,
      toggleLanguage,
      supportedLanguages: SUPPORTED_LANGUAGES,
      getCurrentLanguageLabel,
      getCurrentLanguageShortLabel,
    }),
    [
      contentLanguage,
      setContentLanguage,
      toggleLanguage,
      getCurrentLanguageLabel,
      getCurrentLanguageShortLabel,
    ]
  );

  return (
    <ContentLanguageContext.Provider value={value}>
      {children}
    </ContentLanguageContext.Provider>
  );
};

export const useContentLanguage = () => {
  const context = useContext(ContentLanguageContext);
  if (!context) {
    throw new Error(
      "useContentLanguage must be used within ContentLanguageProvider"
    );
  }
  return context;
};
