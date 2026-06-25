import { cloneElement, useMemo, useState, useEffect } from 'react';
import { useLocation, useOutlet, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Light, Asleep, ArrowLeft } from '@carbon/icons-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTheme } from '@/shared/ui/theme/ThemeContext';
import { useContentLanguage } from '@/shared/contexts/ContentLanguageContext';
import { IconModeSwitcher, type IconModeOption } from '@/shared/ui/navigation/IconModeSwitcher';
import { TextModeSwitcher, type TextModeOption } from '@/shared/ui/navigation/TextModeSwitcher';
import { BrandLockup } from '@/shared/brand/BrandLockup';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n';
import { AuthLayoutContext, type AuthMetadata } from '../../contexts/AuthLayoutContext';
import "../../screens/AuthPages.scss";

const themeOptions: IconModeOption<'light' | 'dark'>[] = [
  { value: 'light', label: 'Light', icon: Light },
  { value: 'dark', label: 'Dark', icon: Asleep },
];

const AuthLayout = () => {
  const { t } = useTranslation();
  const { theme, preference, setPreference } = useTheme();
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

  const themeValue = preference === 'system'
    ? theme === 'g100' || theme === 'g90'
      ? 'dark'
      : 'light'
    : preference;

  const authScreen = useMemo(() => {
    const path = location.pathname;
    if (path === '/login') return 'login';
    if (path === '/register') return 'register';
    if (path.startsWith('/login/campus-sso')) return 'campus-sso';
    if (path.startsWith('/oauth/authorize')) return 'oauth-authorize';
    if (path.startsWith('/auth/')) return 'callback';
    if (path === '/onboarding') return 'onboarding';
    return 'auth';
  }, [location.pathname]);

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
    if (path.startsWith('/oauth/authorize')) {
      return {
        title: t("oauth.authorize.title", "MCP OAuth 授權"),
        subtitle: t("oauth.authorize.description", {
          clientName: t("oauth.authorize.defaultClient", "外部應用程式"),
        }),
      };
    }
    if (path === '/onboarding') {
      return {
        title: "完成基本設定",
        subtitle: "先完成個人偏好，之後可在設定中隨時調整。",
      };
    }
    return null;
  }, [location.pathname, t]);

  const metadata = overrideMetadata || pathMetadata;

  const authLayoutValue = useMemo(
    () => ({ setMetadata: setOverrideMetadata }),
    [setOverrideMetadata],
  );

  return (
    <AuthLayoutContext.Provider value={authLayoutValue}>
      <div
        className="auth-split-wrapper auth-login-visual-shell"
        data-auth-theme={themeValue}
        data-auth-screen={authScreen}
      >
        <div
          className="auth-visual-background"
          data-testid="auth-visual-background"
          aria-hidden="true"
        />

        <div className="auth-login-brand">
          <BrandLockup className="auth-login-brand__lockup" size={24} />
        </div>

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

        <main className="auth-login-main">
          <section className="auth-login-split" data-testid="auth-login-split-shell">
            <section className="auth-login-visual-panel" data-testid="auth-login-visual-panel" aria-hidden="true" />

            <section className="auth-login-card" data-testid="auth-login-card-shell">
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
            </section>
          </section>
        </main>
      </div>
    </AuthLayoutContext.Provider>
  );
};

export default AuthLayout;
