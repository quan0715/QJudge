
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@/core/entities/auth.entity";
import { logout as logoutApi } from "@/infrastructure/api/repositories/auth.repository";
import { getCurrentUser } from "@/infrastructure/api/repositories/user.repository";
import {
  clearAuthStorage,
  isAuthSessionStorageEvent,
} from "@/infrastructure/api/http.client";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  checkUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const checkUser = useCallback(async () => {
    try {
      const response = await getCurrentUser();
      setUser(response.data);
    } catch (error) {
      setUser(null);
      const status = (error as { status?: number }).status;
      if (status !== 401) {
        console.error("Failed to load current user", error);
      }
    } finally {
      setLoading(false);
    }
  }, []);

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
    void checkUser();
    const handleStorageChange = (event: StorageEvent) => {
      if (isAuthSessionStorageEvent(event)) {
        void checkUser();
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [checkUser]);

  return (
    <AuthContext.Provider value={{ user, loading, setUser, checkUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
