import { useEffect, useState } from 'react';
import { Grid, Column, Tile, Button } from '@carbon/react';
import { useNavigate } from 'react-router-dom';

interface User {
  username: string;
  email: string;
  role: string;
  auth_provider: string;
  email_verified: boolean;
}

const ProfilePage = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      setUser(JSON.parse(userStr));
    } else {
      navigate('/login');
    }
  }, [navigate]);

  if (!user) {
    return null;
  }

  return (
    <Grid className="landing-page" fullWidth>
      <Column lg={16} md={8} sm={4} className="landing-page__banner">
        <h1 className="landing-page__heading">Personal Homepage</h1>
      </Column>
      <Column lg={16} md={8} sm={4} className="landing-page__r2">
        <Tile style={{ marginBottom: '2rem' }}>
          <h3>Welcome, {user.username}!</h3>
          <p style={{ marginTop: '1rem' }}>Here is your profile information:</p>
          <ul style={{ marginTop: '1rem', listStyle: 'disc', paddingLeft: '1.5rem' }}>
            <li><strong>Email:</strong> {user.email}</li>
            <li><strong>Role:</strong> {user.role}</li>
            <li><strong>Auth Provider:</strong> {user.auth_provider}</li>
            <li><strong>Email Verified:</strong> {user.email_verified ? 'Yes' : 'No'}</li>
          </ul>
        </Tile>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Button onClick={() => navigate('/problems')}>Browse Problems</Button>
          <Button kind="secondary" onClick={() => navigate('/contests')}>View Contests</Button>
        </div>
      </Column>
    </Grid>
  );
};

export default ProfilePage;
