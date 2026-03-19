import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { Button } from '@carbon/react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { oauthCallback } from "@/infrastructure/api/repositories/auth.repository";
import { useAuthLayoutMetadata } from '../contexts/AuthLayoutContext';
import { AuthLoadingSkeleton } from '../components/AuthLoadingSkeleton';

type CallbackState = 'loading' | 'error';

const OAuthCallbackPage = () => {
  const { t } = useTranslation();
  const { provider = 'nycu' } = useParams<{ provider: string }>();
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');
  const errorParam = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  const initialError = errorParam
    ? errorDescription || errorParam
    : !code
      ? t("auth.callback.noCode", "未收到授權碼")
      : '';

  const [state, setState] = useState<CallbackState>(initialError ? 'error' : 'loading');
  const [error, setError] = useState(initialError);

  // Dynamic header metadata
  const metadata = useMemo(() => {
    if (state === 'loading') {
      return {
        title: t("auth.callback.loadingTitle", "歡迎來到 QJudge"),
        subtitle: t("auth.callback.loadingSubtitle", "正在為您準備專屬的程式舞台"),
      };
    }
    return {
      title: t("auth.callback.errorTitle", "登入失敗"),
      subtitle: error,
      backTo: '/login',
    };
  }, [state, error, t]);

  useAuthLayoutMetadata(metadata);

  useEffect(() => {
    if (initialError || !code) return;

    // We want the animation to run for at least 2.5 seconds for better UX
    const startTime = Date.now();
    const MIN_ANIMATION_TIME = 2500;

    const handleCallback = async () => {
      try {
        const redirectUri = `${window.location.origin}/auth/${provider}/callback`;
        const response = await oauthCallback(provider, { code, redirect_uri: redirectUri });

        if (response.success) {
          localStorage.setItem('user', JSON.stringify(response.data.user));
          
          const elapsedTime = Date.now() - startTime;
          const remainingTime = Math.max(0, MIN_ANIMATION_TIME - elapsedTime);

          setTimeout(() => {
            window.location.href = '/dashboard';
          }, remainingTime);
        } else {
          setError(t("auth.callback.failed", "登入失敗"));
          setState('error');
        }
      } catch (err: any) {
        const errorCode = err?.response?.data?.code;
        if (errorCode === "EXAM_LOGIN_BLOCKED") {
          const exam = err.response.data.active_exam;
          setError(
            `考試「${exam?.contest_name || ""}」進行中，無法從其他裝置登入。` +
            `請回到原裝置完成考試後再試。`
          );
          setState('error');
          return;
        }
        console.error(err);
        setError(
          err?.response?.data?.message ||
          err?.response?.data?.error?.message ||
          t("auth.callback.failed", "登入失敗，請稍後再試")
        );
        setState('error');
      }
    };

    handleCallback();
  }, [code, initialError, provider, t]);

  return (
    <div className="auth-form-wrapper">
      <AnimatePresence mode="wait">
        {state === 'loading' && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <AuthLoadingSkeleton />
          </motion.div>
        )}

        {state === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="auth-form"
          >
            <Button
              kind="secondary"
              className="auth-submit-btn"
              onClick={() => window.location.href = '/login'}
            >
              {t("auth.campusSso.backToLogin", "返回登入")}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default OAuthCallbackPage;
