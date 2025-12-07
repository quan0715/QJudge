import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@/ui/theme/ThemeContext';
// Note: AuthProvider is still in legacy location, will be moved in Phase 2
import { AuthProvider } from '@/domains/auth/contexts/AuthContext';

interface AppProvidersProps {
  children: React.ReactNode;
}

export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          {children}
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
};
