import type { TFunction } from "i18next";
import type { AuthProviderOption } from "@/core/entities/auth.entity";

function translateWithFallback(
  t: TFunction,
  key: string,
  fallback: string,
): string {
  const translated = t(key, fallback);

  if (!translated || translated === key) {
    return fallback;
  }

  return translated;
}

export function getProviderDisplayName(t: TFunction, provider: AuthProviderOption): string {
  return translateWithFallback(
    t,
    `auth.providers.${provider.key}.displayName`,
    provider.display_name,
  );
}

export function getProviderDescription(t: TFunction, provider: AuthProviderOption): string {
  return translateWithFallback(t, `auth.providers.${provider.key}.description`, "");
}
