import { createContext, useContext, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export type ContentLanguage = 'zh-TW' | 'en';

interface ContentLanguageContextType {
  contentLanguage: ContentLanguage;
  setContentLanguage: (lang: ContentLanguage) => void;
  toggleLanguage: () => void;
}

const ContentLanguageContext = createContext<ContentLanguageContextType | undefined>(undefined);

export const ContentLanguageProvider = ({ children }: { children: ReactNode }) => {
  const { i18n } = useTranslation();
  const [contentLanguage, setContentLanguageState] = useState<ContentLanguage>('zh-TW');

  const setContentLanguage = (lang: ContentLanguage) => {
    setContentLanguageState(lang);
    i18n.changeLanguage(lang);
  };

  const toggleLanguage = () => {
    const newLang = contentLanguage === 'zh-TW' ? 'en' : 'zh-TW';
    setContentLanguage(newLang);
  };

  return (
    <ContentLanguageContext.Provider value={{ contentLanguage, setContentLanguage, toggleLanguage }}>
      {children}
    </ContentLanguageContext.Provider>
  );
};

export const useContentLanguage = () => {
  const context = useContext(ContentLanguageContext);
  if (!context) {
    throw new Error('useContentLanguage must be used within ContentLanguageProvider');
  }
  return context;
};
