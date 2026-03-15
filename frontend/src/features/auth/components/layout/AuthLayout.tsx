import { cloneElement, useMemo, useState, useEffect } from 'react';
import { useLocation, useOutlet, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Light, Asleep, TaskComplete, ArrowLeft } from '@carbon/icons-react';
import { motion, AnimatePresence } from 'motion/react';
import AuthHeroComposition from '../AuthHeroComposition';
import { useTheme } from '@/shared/ui/theme/ThemeContext';
import { useContentLanguage } from '@/shared/contexts/ContentLanguageContext';
import { IconModeSwitcher, type IconModeOption } from '@/shared/ui/navigation/IconModeSwitcher';
import { TextModeSwitcher, type TextModeOption } from '@/shared/ui/navigation/TextModeSwitcher';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n';
import { AuthLayoutContext, type AuthMetadata } from '../../contexts/AuthLayoutContext';
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
  const [overrideMetadata, setOverrideMetadata] = useState<AuthMetadata | null>(null);

  // Reset override metadata when location changes
  useEffect(() => {
    setOverrideMetadata(null);
  }, [location.pathname]);

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

  const pathMetadata = useMemo(() => {
    const path = location.pathname;
    if (path === '/login') {
      return {
        title: t("auth.login.title"),
        subtitle: t("auth.login.subtitle"),
      };
    }
    if (path === '/register') {
      return {
        title: t("auth.register.title"),
        subtitle: t("auth.register.subtitle"),
      };
    }
    if (path.startsWith('/login/campus-sso')) {
      return {
        title: t("auth.campusSso.title"),
        subtitle: t("auth.campusSso.subtitle"),
        backTo: '/login',
      };
    }
    if (path.startsWith('/auth/')) {
      return {
        title: t("auth.callback.loading"),
        subtitle: '',
        backTo: '/login',
      };
    }
    return null;
  }, [location.pathname, t]);

  const metadata = overrideMetadata || pathMetadata;

  return (
    <AuthLayoutContext.Provider value={{ setMetadata: setOverrideMetadata }}>
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
            
            <div className="auth-form-shell">
              <div className="auth-form-inner">
                <div className="auth-nav-slot">
                  {metadata?.backTo ? (
                    <Link to={metadata.backTo} className="auth-back-link">
                      <ArrowLeft size={16} />
                      {t("auth.campusSso.backToLogin", "返回登入")}
                    </Link>
                  ) : (
                    <div className="auth-back-link-placeholder" />
                  )}
                </div>

                <div className="auth-header-slot">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={metadata?.title + (metadata?.subtitle || '')}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.2 }}
                      className="auth-header"
                    >
                      <h1 className="auth-title">{metadata?.title}</h1>
                      <p className="auth-subtitle">{metadata?.subtitle}</p>
                    </motion.div>
                  </AnimatePresence>
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={location.pathname}
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
          </section>
        </div>
      </div>
    </AuthLayoutContext.Provider>
  );
};

export default AuthLayout;
