import { cloneElement, useMemo } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Light, Asleep } from '@carbon/icons-react';
import { motion, AnimatePresence } from 'motion/react';
import AuthHeroComposition from '../AuthHeroComposition';
import { useTheme } from '@/shared/ui/theme/ThemeContext';
import { useContentLanguage } from '@/shared/contexts/ContentLanguageContext';
import { IconModeSwitcher, type IconModeOption } from '@/shared/ui/navigation/IconModeSwitcher';
import { TextModeSwitcher, type TextModeOption } from '@/shared/ui/navigation/TextModeSwitcher';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import "../../screens/AuthPages.scss";

const themeOptions: IconModeOption<'light' | 'dark'>[] = [
  { value: 'light', label: 'Light', icon: Light },
  { value: 'dark', label: 'Dark', icon: Asleep },
];

const AuthLayout = () => {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();
  const { contentLanguage, setContentLanguage } = useContentLanguage();
  const location = useLocation();
  const outlet = useOutlet();

  const langOptions = useMemo<TextModeOption<string>[]>(
    () =>
      SUPPORTED_LANGUAGES.map((lang) => ({
        value: lang.id,
        label: lang.label,
        shortLabel: lang.shortLabel,
      })),
    [],
  );

  const themeValue = preference === 'system' ? 'dark' : preference;

  return (
    <div className="auth-split-wrapper">
      {/* 左側封面區 */}
      <div className="auth-hero-side">
        <AuthHeroComposition />
        <div className="auth-hero-content">
          <h1 className="auth-hero-title">{t("auth.login.heroTitle")}</h1>
          <p className="auth-hero-subtitle">{t("auth.login.heroSubtitle")}</p>
        </div>
      </div>

      {/* 右側表單區 */}
      <div className="auth-form-side">
        <div className="auth-toolbar">
          <TextModeSwitcher
            value={contentLanguage}
            options={langOptions}
            onChange={setContentLanguage}
            ariaLabel={t("language.title", "語言")}
          />
          <IconModeSwitcher
            value={themeValue}
            options={themeOptions}
            onChange={setPreference}
            ariaLabel={t("theme.title", "主題")}
            tooltipPosition="bottom"
          />
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            className="auth-form-inner"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15, ease: 'easeInOut' }}
          >
            {outlet && cloneElement(outlet, { key: location.pathname })}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default AuthLayout;
