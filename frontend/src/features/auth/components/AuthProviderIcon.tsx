import { LogoGithub } from "@carbon/icons-react";
import type { AuthProviderOption } from "@/core/entities/auth.entity";

const normalizeProviderName = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

const getProviderInitial = (provider: AuthProviderOption): string =>
  provider.display_name.trim().charAt(0).toUpperCase() || provider.key.charAt(0).toUpperCase();

export const AuthProviderIcon = ({ provider }: { provider: AuthProviderOption }) => {
  if (provider.logo_url) {
    return (
      <img
        src={provider.logo_url}
        alt=""
        className="auth-oauth-btn__icon"
        width={20}
        height={20}
      />
    );
  }

  const providerName = normalizeProviderName(`${provider.key} ${provider.display_name}`);

  if (providerName.includes("github")) {
    return <LogoGithub size={20} className="auth-oauth-btn__icon" aria-hidden="true" />;
  }

  return (
    <span className="auth-oauth-btn__icon auth-oauth-btn__icon--fallback" aria-hidden="true">
      {getProviderInitial(provider)}
    </span>
  );
};
