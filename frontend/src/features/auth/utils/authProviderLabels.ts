import type { TFunction } from "i18next";
import type { AuthProviderOption } from "@/core/entities/auth.entity";

function interpolate(template: string, params?: Record<string, string>): string {
  if (!params) return template;

  return Object.entries(params).reduce(
    (value, [key, replacement]) => value.replaceAll(`{{${key}}}`, replacement),
    template,
  );
}

function translateWithFallback(
  t: TFunction,
  key: string,
  fallback: string,
  params?: Record<string, string>,
): string {
  const translated = params
    ? t(key, { defaultValue: fallback, ...params })
    : t(key, fallback);

  if (!translated || translated === key) {
    return interpolate(fallback, params);
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

export function getProviderActionLabel(
  t: TFunction,
  provider: AuthProviderOption,
  action: "login" | "register",
): string {
  const providerName = getProviderDisplayName(t, provider);
  const actionKey = action === "login" ? "loginWith" : "registerWith";
  const fallback = action === "login"
    ? `使用 ${providerName} 登入`
    : `使用 ${providerName} 建立帳號`;
  const actionLabel = translateWithFallback(
    t,
    `auth.providerActions.${actionKey}`,
    fallback,
    { provider: providerName },
  );

  return translateWithFallback(t, `auth.providers.${provider.key}.${action}Label`, actionLabel);
}
