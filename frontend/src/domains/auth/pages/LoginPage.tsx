import { useState } from 'react';
import { TextInput, PasswordInput, Button, Form, InlineLoading } from '@carbon/react';
import { ArrowRight } from '@carbon/icons-react';
import { Link } from 'react-router-dom';
import { login, getOAuthUrl } from '@/services/auth';
import MatrixBackground from '../components/MatrixBackground';
import './AuthPages.css';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await login({ email, password });
      if (response.success) {
        localStorage.setItem('token', response.data.access_token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        window.location.href = '/dashboard';
      } else {
        setError('Login failed');
      }
    } catch (err: any) {
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
      const url = await getOAuthUrl(provider);
      window.location.href = url;
    } catch {
      setError('Failed to initiate login');
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <MatrixBackground />
      
      <div className="auth-modal">
        {/* Title */}
        <div className="auth-header">
          <h1 className="auth-title">QJudge</h1>
          <p className="auth-subtitle">歡迎回來，請登入您的帳號</p>
        </div>

        {/* Form */}
        <Form onSubmit={handleLogin} className="auth-form">
          <TextInput
            id="email"
            labelText="Email"
            placeholder="student@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          
          <PasswordInput
            id="password"
            labelText="密碼"
            placeholder="輸入您的密碼"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          
          {error && (
            <p className="auth-error">{error}</p>
          )}
          
          <div className="auth-actions">
            {loading ? (
              <InlineLoading description="登入中..." />
            ) : (
              <Button kind="primary" type="submit" className="auth-submit-btn">
                登入
              </Button>
            )}
          </div>
          
          <div className="auth-divider">
            <span>或</span>
          </div>
          
          <Button 
            kind="tertiary" 
            renderIcon={ArrowRight} 
            className="auth-oauth-btn"
            onClick={() => handleOAuthLogin('nycu')}
          >
            使用 SSO 登入
          </Button>
        </Form>

        {/* Footer */}
        <div className="auth-footer">
          <p>
            還沒有帳號？{' '}
            <Link to="/register" className="auth-link">
              立即註冊
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
