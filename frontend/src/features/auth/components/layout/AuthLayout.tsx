import { cloneElement, useMemo } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Light, Asleep, TaskComplete } from '@carbon/icons-react';
import { motion, AnimatePresence } from 'motion/react';
import AuthHeroComposition from '../AuthHeroComposition';
import { useTheme } from '@/shared/ui/theme/ThemeContext';
import { useContentLanguage } from '@/shared/contexts/ContentLanguageContext';
import { IconModeSwitcher, type IconModeOption } from '@/shared/ui/navigation/IconModeSwitcher';
import { TextModeSwitcher, type TextModeOption } from '@/shared/ui/navigation/TextModeSwitcher';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n';
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

  const langOptions = useMemo<TextModeOption<SupportedLanguage>[]>(
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
      <div className="auth-split-grid">
        <section className="auth-hero-side" aria-hidden="true">
          <div className="auth-hero-logo">
            <TaskComplete size={20} className="auth-hero-logo__icon" />
            <span className="auth-hero-logo__text">QJudge</span>
          </div>
          <div className="auth-hero-shell">
            <AuthHeroComposition />
            <div className="auth-hero-content">
              <h1 className="auth-hero-title">{t("auth.login.heroTitle")}</h1>
              <p className="auth-hero-subtitle">{t("auth.login.heroSubtitle")}</p>
            </div>
          </div>
        </section>

        <section className="auth-form-side">
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
              className="auth-form-shell"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15, ease: 'easeInOut' }}
            >
              <div className="auth-form-inner">
                {outlet && cloneElement(outlet, { key: location.pathname })}
              </div>
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
};

export default AuthLayout;
