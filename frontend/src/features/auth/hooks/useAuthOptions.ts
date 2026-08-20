import { useCallback, useEffect, useState } from "react";
import type { AuthOptions } from "@/core/entities/auth.entity";
import { getAuthOptions } from "@/infrastructure/api/repositories/auth.repository";

const UNRESOLVED_AUTH_OPTIONS: AuthOptions = {
  password_enabled: false,
  providers: [],
};

export const useAuthOptions = () => {
  const [options, setOptions] = useState<AuthOptions>(UNRESOLVED_AUTH_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setAttempt((currentAttempt) => currentAttempt + 1);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    getAuthOptions()
      .then((response) => {
        if (active) setOptions(response.data);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setOptions(UNRESOLVED_AUTH_OPTIONS);
          setError(
            requestError instanceof Error
              ? requestError
              : new Error("Failed to load authentication options"),
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [attempt]);

  return { options, loading, error, retry };
};
