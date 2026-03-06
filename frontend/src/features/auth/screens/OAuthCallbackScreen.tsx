import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { InlineLoading } from '@carbon/react';
import { oauthCallback, resolveConflict } from "@/infrastructure/api/repositories/auth.repository";

const OAuthCallbackPage = () => {
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');
  const errorParam = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');
  const initialError = errorParam
    ? errorDescription || errorParam
    : !code
      ? 'No authorization code found'
      : '';
  const [error, setError] = useState(initialError);
  const [conflictToken, setConflictToken] = useState<string>("");
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (initialError || !code) {
      return;
    }

    const handleCallback = async () => {
      try {
        // The redirect_uri must match exactly what was sent in the initial request
        const redirectUri = `${window.location.origin}/auth/nycu/callback`;
        
        const response = await oauthCallback({
          code,
          redirect_uri: redirectUri,
        });

        if (response.success) {
          localStorage.setItem('user', JSON.stringify(response.data.user));
          // Use full page redirect to ensure AuthContext picks up the new state
          window.location.href = '/dashboard';
        } else {
          setError('OAuth login failed');
        }
      } catch (err: any) {
        if (
          err?.response?.status === 409 &&
          err?.response?.data?.code === "EXAM_CONFLICT_ACTIVE_SESSION" &&
          err?.response?.data?.conflict_token
        ) {
          setConflictToken(err.response.data.conflict_token);
          setError("偵測到進行中的考試，請選擇是否接管。");
          return;
        }
        console.error(err);
        setError('Failed to complete login');
      }
    };

    handleCallback();
  }, [code, initialError]);

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
        setError("接管失敗，請聯繫監考老師。");
      }
    } catch (err) {
      console.error(err);
      setError("接管失敗，請聯繫監考老師。");
    } finally {
      setResolving(false);
    }
  };

  if (error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
        <h2 style={{ color: 'red', marginBottom: '1rem' }}>Login Failed</h2>
        <p>{error}</p>
        {conflictToken ? (
          <button
            onClick={handleTakeover}
            disabled={resolving}
            style={{ marginTop: '1rem', padding: '0.5rem 1rem', cursor: 'pointer' }}
          >
            {resolving ? "處理中..." : "接管並鎖定舊裝置"}
          </button>
        ) : null}
        <button 
          onClick={() => window.location.href = '/login'}
          style={{ marginTop: '1rem', padding: '0.5rem 1rem', cursor: 'pointer' }}
        >
          Return to Login
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
      <InlineLoading description="Completing login..." />
    </div>
  );
};

export default OAuthCallbackPage;
