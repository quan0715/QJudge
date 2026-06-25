import { createContext, useContext, useEffect } from 'react';

export interface AuthMetadata {
  title?: string;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
}

export interface AuthLayoutContextType {
  setMetadata: (metadata: AuthMetadata | null) => void;
}

export const AuthLayoutContext = createContext<AuthLayoutContextType | null>(null);

export const useAuthLayoutMetadata = (metadata: AuthMetadata) => {
  const context = useContext(AuthLayoutContext);
  const { title, subtitle, backTo, backLabel } = metadata;

  useEffect(() => {
    if (context) {
      context.setMetadata({ title, subtitle, backTo, backLabel });
    }
    // No cleanup to null here because it might clear another screen's metadata
  }, [context, title, subtitle, backTo, backLabel]);
};
