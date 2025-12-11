import { createContext, useContext, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "./ToastContext";
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
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const [contentLanguage, setContentLanguageState] =
    useState<ContentLanguage>("zh-TW");

  const getLanguageLabel = (langId: ContentLanguage) => {
    return SUPPORTED_LANGUAGES.find((l) => l.id === langId)?.label || langId;
  };

  const showLanguageChangeToast = (lang: ContentLanguage) => {
    showToast({
      kind: "info",
      title: t("language.switchedTitle"),
      subtitle: t("language.switchedTo", { language: getLanguageLabel(lang) }),
      timeout: 3000,
    });
  };

  const setContentLanguage = (lang: ContentLanguage) => {
    setContentLanguageState(lang);
    i18n.changeLanguage(lang).then(() => {
      showLanguageChangeToast(lang);
    });
  };

  const toggleLanguage = () => {
    setContentLanguageState((prev) => {
      const currentIndex = SUPPORTED_LANGUAGES.findIndex((l) => l.id === prev);
      const nextIndex = (currentIndex + 1) % SUPPORTED_LANGUAGES.length;
      const newLang = SUPPORTED_LANGUAGES[nextIndex].id;
      i18n.changeLanguage(newLang).then(() => {
        showLanguageChangeToast(newLang);
      });
      return newLang;
    });
  };

  const getCurrentLanguageLabel = () => {
    return getLanguageLabel(contentLanguage);
  };

  const getCurrentLanguageShortLabel = () => {
    return (
      SUPPORTED_LANGUAGES.find((l) => l.id === contentLanguage)?.shortLabel ||
      contentLanguage
    );
  };

  return (
    <ContentLanguageContext.Provider
      value={{
        contentLanguage,
        setContentLanguage,
        toggleLanguage,
        supportedLanguages: SUPPORTED_LANGUAGES,
        getCurrentLanguageLabel,
        getCurrentLanguageShortLabel,
      }}
    >
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
