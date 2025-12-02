import { useState } from 'react';
import { Form, TextInput, PasswordInput, Button, InlineLoading } from '@carbon/react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/services/api';
import loginBg from '@/assets/login_split_bg.png';

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
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await api.register({ username, email, password, password_confirm: confirmPassword });
      if (response.success) {
        localStorage.setItem('token', response.data.access_token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        navigate('/dashboard');
      } else {
        setError('Registration failed');
      }
    } catch (err: any) {
      // Extract error message from backend response
      if (err.response?.data?.error?.message) {
        setError(err.response.data.error.message);
      } else {
        setError('Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', minHeight: '100vh' }}>
      {/* Left Side - Image */}
      <div style={{ flex: 1, backgroundImage: `url(${loginBg})`, backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '4rem', color: 'white', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0, 0, 0, 0.6)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1 style={{ fontSize: '3rem', fontWeight: 'bold', marginBottom: '1rem' }}>Join the Community</h1>
          <p style={{ fontSize: '1.25rem' }}>Start your journey to mastering algorithms today.</p>
        </div>
      </div>

      {/* Right Side - Register Form */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', paddingTop: '8rem', paddingLeft: '4rem', paddingRight: '4rem', paddingBottom: '4rem', backgroundColor: 'var(--cds-layer-01)' }}>
        <div style={{ maxWidth: '400px', width: '100%', margin: '0 auto' }}>
          <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
            <h2 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Create Account</h2>
            <p style={{ color: 'var(--cds-text-secondary)' }}>Fill in your details to register</p>
          </div>

          <div className="carbon-panel" style={{ padding: '2rem' }}>
            <Form onSubmit={handleRegister}>
              <TextInput
                id="username"
                labelText="Username"
                placeholder="Choose a username"
                style={{ marginBottom: '1rem' }}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <TextInput
                id="email"
                labelText="Email"
                placeholder="Enter your email"
                style={{ marginBottom: '1rem' }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <div style={{ marginBottom: '1rem' }}>
                <PasswordInput
                  id="password"
                  labelText="Password"
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div style={{ marginBottom: '2rem' }}>
                <PasswordInput
                  id="confirm-password"
                  labelText="Confirm Password"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              {error && <p style={{ color: 'red', marginBottom: '1rem' }}>{error}</p>}
              <div style={{ marginBottom: '1rem' }}>
                {loading ? <InlineLoading description="Registering..." /> : (
                  <Button kind="primary" type="submit" style={{ width: '100%' }}>
                    Register
                  </Button>
                )}
              </div>
            </Form>
          </div>
          
          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <p style={{ color: 'var(--cds-text-secondary)' }}>
              Already have an account? <Link to="/login" style={{ fontWeight: 'bold', color: 'var(--nycu-primary)' }}>Log in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
