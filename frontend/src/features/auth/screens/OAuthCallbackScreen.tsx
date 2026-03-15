import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { Loading, Button } from '@carbon/react';
import { Login } from '@carbon/icons-react';
import { useTranslation } from 'react-i18next';
import { oauthCallback, resolveConflict } from "@/infrastructure/api/repositories/auth.repository";
import { useAuthLayoutMetadata } from '../contexts/AuthLayoutContext';

type CallbackState = 'loading' | 'error' | 'conflict';

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
  const [conflictToken, setConflictToken] = useState<string>("");
  const [resolving, setResolving] = useState(false);

  // Dynamic header metadata
  const metadata = useMemo(() => {
    if (state === 'loading') {
      return {
        title: t("auth.callback.loading"),
        subtitle: t("auth.callback.loadingDesc"),
        backTo: '/login',
      };
    }
    return {
      title: state === 'conflict'
        ? t("auth.callback.conflictTitle", "考試衝突")
        : t("auth.callback.errorTitle", "登入失敗"),
      subtitle: error,
      backTo: '/login',
    };
  }, [state, error, t]);

  useAuthLayoutMetadata(metadata);

  useEffect(() => {
    if (initialError || !code) return;

    const handleCallback = async () => {
      try {
        const redirectUri = `${window.location.origin}/auth/${provider}/callback`;
        const response = await oauthCallback(provider, { code, redirect_uri: redirectUri });

        if (response.success) {
          localStorage.setItem('user', JSON.stringify(response.data.user));
          window.location.href = '/dashboard';
        } else {
          setError(t("auth.callback.failed", "登入失敗"));
          setState('error');
        }
      } catch (err: any) {
        if (
          err?.response?.status === 409 &&
          err?.response?.data?.code === "EXAM_CONFLICT_ACTIVE_SESSION" &&
          err?.response?.data?.conflict_token
        ) {
          setConflictToken(err.response.data.conflict_token);
          setError(t("auth.callback.examConflict", "偵測到進行中的考試，請選擇是否接管。"));
          setState('conflict');
          return;
        }
        console.error(err);
        setError(t("auth.callback.failed", "登入失敗，請稍後再試"));
        setState('error');
      }
    };

    handleCallback();
  }, [code, initialError, provider, t]);

  const handleTakeover = async () => {
    if (!conflictToken || resolving) return;
    setResolving(true);
    try {
      const response = await resolveConflict({
        conflict_token: conflictToken,
        action: "takeover_lock",
      });
      if (response.success) {
        localStorage.setItem('user', JSON.stringify(response.data.user));
        window.location.href = '/dashboard';
      } else {
        setError(t("auth.callback.takeoverFailed", "接管失敗，請聯繫監考老師。"));
        setState('error');
      }
    } catch {
      setError(t("auth.callback.takeoverFailed", "接管失敗，請聯繫監考老師。"));
      setState('error');
    } finally {
      setResolving(false);
    }
  };

  if (state === 'loading') {
    return (
      <div className="auth-callback">
        <Loading withOverlay={false} small={false} />
      </div>
    );
  }

  return (
    <div className="auth-form">
      {state === 'conflict' && (
        <Button
          kind="danger"
          renderIcon={Login}
          className="auth-submit-btn"
          onClick={handleTakeover}
          disabled={resolving}
        >
          {resolving
            ? t("auth.callback.takingOver", "處理中...")
            : t("auth.callback.takeover", "接管並鎖定舊裝置")}
        </Button>
      )}
    </div>
  );
};

export default OAuthCallbackPage;
