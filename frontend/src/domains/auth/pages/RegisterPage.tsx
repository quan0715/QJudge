import { useState } from 'react';
import { Form, TextInput, PasswordInput, Button, InlineLoading } from '@carbon/react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '@/services/auth';
import MatrixBackground from '../components/MatrixBackground';
import './AuthPages.css';

const RegisterPage = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('密碼不一致');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await register({ username, email, password, password_confirm: confirmPassword });
      if (response.success) {
        localStorage.setItem('token', response.data.access_token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        navigate('/dashboard');
      } else {
        setError('註冊失敗');
      }
    } catch (err: any) {
      if (err.response?.data?.error?.message) {
        setError(err.response.data.error.message);
      } else {
        setError('註冊失敗，請稍後再試');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <MatrixBackground />
      
      <div className="auth-modal">
        {/* Title */}
        <div className="auth-header">
          <h1 className="auth-title">建立帳號</h1>
          <p className="auth-subtitle">加入 QJudge，開始您的程式之旅</p>
        </div>

        {/* Form */}
        <Form onSubmit={handleRegister} className="auth-form">
          <TextInput
            id="username"
            labelText="使用者名稱"
            placeholder="選擇一個使用者名稱"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          
          <TextInput
            id="email"
            labelText="Email"
            placeholder="輸入您的 Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          
          <PasswordInput
            id="password"
            labelText="密碼"
            placeholder="建立一個密碼"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          
          <PasswordInput
            id="confirm-password"
            labelText="確認密碼"
            placeholder="再次輸入密碼"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
          
          {error && (
            <p className="auth-error">{error}</p>
          )}
          
          <div className="auth-actions">
            {loading ? (
              <InlineLoading description="註冊中..." />
            ) : (
              <Button kind="primary" type="submit" className="auth-submit-btn">
                註冊
              </Button>
            )}
          </div>
        </Form>

        {/* Footer */}
        <div className="auth-footer">
          <p>
            已經有帳號？{' '}
            <Link to="/login" className="auth-link">
              登入
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
