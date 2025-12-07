import { Outlet, useNavigate } from 'react-router-dom';
import {
  Header,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  HeaderNavigation,
  HeaderMenuItem,
} from '@carbon/react';
import { Asleep, Light, Home } from '@carbon/icons-react';
import { useTheme } from '@/ui/theme/ThemeContext';
import { UserAvatarDisplay } from '@/ui/components/UserAvatarDisplay';

const ProblemLayout = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header aria-label="Problem Platform">
        <HeaderName href="#" prefix="NYCU" onClick={(e) => { e.preventDefault(); navigate('/dashboard'); }}>
          QJudge
        </HeaderName>
        <HeaderNavigation aria-label="Problem Navigation">
          <HeaderMenuItem onClick={() => navigate('/problems')}>
            返回題目列表
          </HeaderMenuItem>
        </HeaderNavigation>
        <HeaderGlobalBar>
          <HeaderGlobalAction 
            aria-label="Dashboard" 
            tooltipAlignment="center"
            onClick={() => navigate('/dashboard')}
          >
            <Home size={20} />
          </HeaderGlobalAction>
          
          <HeaderGlobalAction 
            aria-label={theme === 'white' ? 'Switch to Dark Mode' : 'Switch to Light Mode'} 
            tooltipAlignment="center"
            onClick={toggleTheme}
          >
            {theme === 'white' ? <Asleep size={20} /> : <Light size={20} />}
          </HeaderGlobalAction>

          {/* User Info Display */}
          <UserAvatarDisplay />
        </HeaderGlobalBar>
      </Header>
      
      {/* Main Content - Account for fixed header height */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginTop: '3rem' }}>
        <Outlet />
      </div>
    </div>
  );
};

export default ProblemLayout;
