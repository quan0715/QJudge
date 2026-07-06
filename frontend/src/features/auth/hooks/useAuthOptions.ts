import { useEffect, useState } from "react";
import type { AuthOptions } from "@/core/entities/auth.entity";
import { getAuthOptions } from "@/infrastructure/api/repositories/auth.repository";

const DEFAULT_AUTH_OPTIONS: AuthOptions = {
  password_enabled: true,
  providers: [],
};

export const useAuthOptions = () => {
  const [options, setOptions] = useState<AuthOptions>(DEFAULT_AUTH_OPTIONS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    getAuthOptions()
      .then((response) => {
        if (active) setOptions(response.data);
      })
      .catch(() => {
        if (active) setOptions(DEFAULT_AUTH_OPTIONS);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { options, loading };
};
