import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { InlineLoading } from '@carbon/react';
import { api } from '../services/api';

const OAuthCallbackPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (errorParam) {
      setError(errorDescription || errorParam);
      return;
    }

    if (!code) {
      setError('No authorization code found');
      return;
    }

    const handleCallback = async () => {
      try {
        // The redirect_uri must match exactly what was sent in the initial request
        const redirectUri = `${window.location.origin}/auth/nycu/callback`;
        
        const response = await api.oauthCallback({
          code,
          redirect_uri: redirectUri,
        });

        if (response.success) {
          localStorage.setItem('token', response.data.access_token);
          localStorage.setItem('user', JSON.stringify(response.data.user));
          navigate('/dashboard');
        } else {
          setError('OAuth login failed');
        }
      } catch (err) {
        console.error(err);
        setError('Failed to complete login');
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  if (error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
        <h2 style={{ color: 'red', marginBottom: '1rem' }}>Login Failed</h2>
        <p>{error}</p>
        <button 
          onClick={() => navigate('/login')}
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
