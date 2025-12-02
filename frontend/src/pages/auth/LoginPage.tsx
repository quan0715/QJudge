import { useState } from 'react';
import { TextInput, PasswordInput, Button, Form, InlineLoading } from '@carbon/react';
import { ArrowRight } from '@carbon/icons-react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/services/api';

const LoginPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await api.login({ email, password });
      if (response.success) {
        localStorage.setItem('token', response.data.access_token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        navigate('/dashboard');
      } else {
        setError('Login failed');
      }
    } catch (err: any) {
      // Extract error message from backend response
      if (err.response?.data?.error?.message) {
        setError(err.response.data.error.message);
      } else {
        setError('Invalid email or password');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: string) => {
    try {
      setLoading(true);
      const url = await api.getOAuthUrl(provider);
      window.location.href = url;
    } catch (err) {
      setError('Failed to initiate login');
      setLoading(false);
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', minHeight: '100vh' }}>
      {/* Left Side - Image */}
      <div style={{ flex: 1, backgroundImage: 'url(/src/assets/login_split_bg.png)', backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '4rem', color: 'white', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0, 0, 0, 0.6)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1 style={{ fontSize: '3rem', fontWeight: 'bold', marginBottom: '1rem' }}>QJudge</h1>
          <p style={{ fontSize: '1.25rem' }}>Join the community of developers and master your coding skills.</p>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', paddingTop: '8rem', paddingLeft: '4rem', paddingRight: '4rem', paddingBottom: '4rem', backgroundColor: 'var(--cds-layer-01)' }}>
        <div style={{ maxWidth: '400px', width: '100%', margin: '0 auto' }}>
          <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
            <h2 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Welcome Back</h2>
            <p style={{ color: 'var(--cds-text-secondary)' }}>Sign in to continue your journey</p>
          </div>

          <div className="carbon-panel" style={{ padding: '2rem' }}>
            <Form onSubmit={handleLogin}>
              <TextInput
                id="email"
                labelText="Email"
                placeholder="student@example.com"
                style={{ marginBottom: '1rem' }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <div style={{ marginBottom: '2rem' }}>
                <PasswordInput
                  id="password"
                  labelText="Password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && <p style={{ color: 'red', marginBottom: '1rem' }}>{error}</p>}
              <div style={{ marginBottom: '1rem' }}>
                  {loading ? <InlineLoading description="Logging in..." /> : (
                      <Button kind="primary" type="submit" style={{ width: '100%' }}>
                      Log in
                      </Button>
                  )}
              </div>
              
              <div style={{ position: 'relative', margin: '1.5rem 0', textAlign: 'center' }}>
                <hr style={{ border: '0', borderTop: '1px solid #e0e0e0' }} />
                <span style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', background: 'var(--cds-layer-01)', padding: '0 10px', color: '#888', fontSize: '0.875rem' }}>OR</span>
              </div>
              <Button kind="tertiary" renderIcon={ArrowRight} style={{ width: '100%' }} onClick={() => handleOAuthLogin('nycu')}>
                Sign in with SSO
              </Button>
            </Form>
          </div>
          
          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <p style={{ color: 'var(--cds-text-secondary)' }}>
              Don't have an account? <Link to="/register" style={{ fontWeight: 'bold', color: 'var(--nycu-primary)' }}>Register now</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
