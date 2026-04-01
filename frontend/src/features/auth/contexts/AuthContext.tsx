
import React, { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import type { User } from "@/core/entities/auth.entity";
import { logout as logoutApi } from "@/infrastructure/api/repositories/auth.repository";
import { clearAuthStorage } from "@/infrastructure/api/http.client";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  checkUser: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const lastUserStrRef = useRef<string | null>(null);

  const checkUser = () => {
    const userStr = localStorage.getItem('user');
    // Skip setUser if the serialized value hasn't changed — prevents
    // unnecessary re-renders when useUserPreferences writes back
    // the same data to localStorage.
    if (userStr === lastUserStrRef.current) {
      setLoading(false);
      return;
    }
    lastUserStrRef.current = userStr;
    if (userStr) {
      try {
        setUser(JSON.parse(userStr));
      } catch (e) {
        console.error("Failed to parse user data", e);
        setUser(null);
      }
    } else {
      setUser(null);
    }
    setLoading(false);
  };

  const logout = async () => {
    try {
      await logoutApi();
    } catch (error) {
      // Network or auth errors shouldn't block client-side logout
      console.warn("Failed to call logout API", error);
    } finally {
      clearAuthStorage();
      setUser(null);
    }
  };

  useEffect(() => {
    checkUser();
    // Listen for storage changes to sync across tabs/components if they update localStorage directly
    const handleStorageChange = () => checkUser();
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, setUser, checkUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
