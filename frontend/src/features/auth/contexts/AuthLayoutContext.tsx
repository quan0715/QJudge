import { createContext, useContext, useEffect } from 'react';

export interface AuthMetadata {
  title?: string;
  subtitle?: string;
  backTo?: string;
}

export interface AuthLayoutContextType {
  setMetadata: (metadata: AuthMetadata | null) => void;
}

export const AuthLayoutContext = createContext<AuthLayoutContextType | null>(null);

export const useAuthLayoutMetadata = (metadata: AuthMetadata) => {
  const context = useContext(AuthLayoutContext);
  const { title, subtitle, backTo } = metadata;
  
  useEffect(() => {
    if (context) {
      context.setMetadata({ title, subtitle, backTo });
    }
    // No cleanup to null here because it might clear another screen's metadata
  }, [title, subtitle, backTo, context]);
};
